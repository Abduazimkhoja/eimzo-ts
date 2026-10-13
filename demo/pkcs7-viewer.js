/*
 * Просмотр содержимого PKCS#7 (CMS SignedData) для демо. Только чтение структуры:
 * подпись НЕ проверяется — для этого есть /backend/pkcs7/verify/* на e-imzo-server.
 * Понимает BER с неопределённой длиной, который выдаёт E-IMZO (base64 начинается с "MIAG").
 */
(function (global) {
  'use strict';

  var OID_NAMES = {
    '1.2.840.113549.1.7.1': 'data',
    '1.2.840.113549.1.7.2': 'signedData',
    '1.2.840.113549.1.9.3': 'contentType',
    '1.2.840.113549.1.9.4': 'messageDigest',
    '1.2.840.113549.1.9.5': 'signingTime',
    '1.2.840.113549.1.9.16.1.4': 'tstInfo',
    '1.2.840.113549.1.9.16.2.14': 'timeStampToken',
    '1.2.840.113549.1.9.1': 'E',
    '2.5.4.3': 'CN',
    '2.5.4.4': 'SURNAME',
    '2.5.4.5': 'SERIALNUMBER',
    '2.5.4.6': 'C',
    '2.5.4.7': 'L',
    '2.5.4.8': 'ST',
    '2.5.4.10': 'O',
    '2.5.4.11': 'OU',
    '2.5.4.12': 'T',
    '2.5.4.42': 'NAME',
    '0.9.2342.19200300.100.1.1': 'UID',
    '1.2.860.3.16.1.1': 'INN',
    '1.2.860.3.16.1.2': 'PINFL'
  };

  var UNIVERSAL_NAMES = {
    1: 'BOOLEAN', 2: 'INTEGER', 3: 'BIT STRING', 4: 'OCTET STRING', 5: 'NULL', 6: 'OBJECT IDENTIFIER',
    12: 'UTF8String', 16: 'SEQUENCE', 17: 'SET', 19: 'PrintableString', 20: 'T61String',
    22: 'IA5String', 23: 'UTCTime', 24: 'GeneralizedTime', 30: 'BMPString'
  };

  // ---------- BER/DER ----------

  function base64ToBytes(b64) {
    var bin = atob(String(b64).replace(/[^A-Za-z0-9+/=]/g, ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function readNode(buf, pos) {
    // Каждый байт читается с проверкой границ: повреждённые данные дают ошибку, а не зависание.
    function next() {
      if (pos >= buf.length) throw new Error('Неожиданный конец данных');
      return buf[pos++];
    }
    var start = pos;
    var b = next();
    var node = { buf: buf, cls: b >> 6, constructed: (b & 0x20) !== 0, num: b & 0x1f, start: start, children: null };
    if (node.num === 0x1f) {
      node.num = 0;
      do { b = next(); node.num = node.num * 128 + (b & 0x7f); } while (b & 0x80);
    }
    var len = next();
    var indefinite = len === 0x80;
    if (!indefinite && (len & 0x80)) {
      var n = len & 0x7f;
      if (n > 6) throw new Error('Слишком большая длина элемента');
      len = 0;
      for (var i = 0; i < n; i++) len = len * 256 + next();
    }
    node.valueStart = pos;

    if (indefinite) {
      if (!node.constructed) throw new Error('Неопределённая длина у примитивного элемента');
      node.children = [];
      while (!(buf[pos] === 0 && buf[pos + 1] === 0)) {
        if (pos + 1 >= buf.length) throw new Error('Нет маркера конца элемента неопределённой длины');
        var child = readNode(buf, pos);
        node.children.push(child);
        pos = child.end;
      }
      node.valueEnd = pos;
      node.end = pos + 2; // маркер конца 00 00
    } else {
      node.valueEnd = pos + len;
      node.end = node.valueEnd;
      if (node.end > buf.length) throw new Error('Длина элемента выходит за пределы данных');
      if (node.constructed) {
        node.children = [];
        for (var p = pos; p < node.valueEnd;) {
          var c = readNode(buf, p);
          if (c.end > node.valueEnd) throw new Error('Вложенный элемент выходит за пределы родителя');
          node.children.push(c);
          p = c.end;
        }
      }
    }
    return node;
  }

  function isUniversal(node, num) { return node && node.cls === 0 && node.num === num; }
  function isContext(node, num) { return node && node.cls === 2 && node.num === num; }
  function value(node) { return node.buf.subarray(node.valueStart, node.valueEnd); }

  /** OCTET STRING в BER может быть разбит на куски — склеиваем. */
  function octets(node) {
    if (!node.constructed) return value(node);
    var parts = node.children.map(octets);
    var total = parts.reduce(function (s, p) { return s + p.length; }, 0);
    var out = new Uint8Array(total);
    var offset = 0;
    parts.forEach(function (p) { out.set(p, offset); offset += p.length; });
    return out;
  }

  function oid(node) {
    var v = value(node);
    var parts = [];
    var acc = 0;
    for (var i = 0; i < v.length; i++) {
      acc = acc * 128 + (v[i] & 0x7f);
      if (!(v[i] & 0x80)) {
        if (parts.length === 0) {
          var first = acc < 80 ? Math.floor(acc / 40) : 2;
          parts.push(first, acc - first * 40);
        } else {
          parts.push(acc);
        }
        acc = 0;
      }
    }
    return parts.join('.');
  }

  function hex(bytes) {
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function decodeText(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) { return null; }
  }

  function text(node) {
    var v = value(node);
    if (node.num === 30) { // BMPString, UTF-16BE
      var s = '';
      for (var i = 0; i + 1 < v.length; i += 2) s += String.fromCharCode((v[i] << 8) | v[i + 1]);
      return s;
    }
    var t = decodeText(v);
    return t !== null ? t : String.fromCharCode.apply(null, Array.from(v));
  }

  function time(node) {
    var s = text(node);
    var m = node.num === 23
      ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/.exec(s)
      : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/.exec(s);
    if (!m) return null;
    var year = Number(m[1]);
    if (node.num === 23) year += year < 50 ? 2000 : 1900;
    return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0)));
  }

  // ---------- CMS ----------

  function parseName(nameNode) {
    var result = {};
    (nameNode.children || []).forEach(function (rdn) {
      (rdn.children || []).forEach(function (atv) {
        var key = oid(atv.children[0]);
        result[OID_NAMES[key] || key] = text(atv.children[1]);
      });
    });
    return result;
  }

  function parseCertificate(certNode) {
    var tbs = certNode.children[0];
    var i = isContext(tbs.children[0], 0) ? 1 : 0; // необязательное поле version
    var validity = tbs.children[i + 3];
    return {
      serialNumber: hex(value(tbs.children[i])).replace(/^00/, ''),
      issuer: parseName(tbs.children[i + 2]),
      subject: parseName(tbs.children[i + 4]),
      validFrom: time(validity.children[0]),
      validTo: time(validity.children[1])
    };
  }

  function readAttributes(setNode) {
    var attrs = {};
    if (!setNode) return attrs;
    setNode.children.forEach(function (attr) {
      attrs[oid(attr.children[0])] = attr.children[1].children[0];
    });
    return attrs;
  }

  /** ContentInfo → SignedData */
  function signedDataOf(contentInfo) {
    if (!isUniversal(contentInfo, 16) || oid(contentInfo.children[0]) !== '1.2.840.113549.1.7.2') {
      throw new Error('Это не PKCS#7 SignedData');
    }
    return contentInfo.children[1].children[0];
  }

  function encapsulatedContent(signedData) {
    var encap = signedData.children[2];
    var wrapper = encap.children[1];
    return {
      contentType: oid(encap.children[0]),
      bytes: wrapper && isContext(wrapper, 0) ? octets(wrapper.children[0]) : null
    };
  }

  /** Время из токена метки времени: TimeStampToken → TSTInfo.genTime. */
  function timestampTime(tokenNode) {
    var tst = encapsulatedContent(signedDataOf(tokenNode));
    if (!tst.bytes) return null;
    var tstInfo = readNode(tst.bytes, 0);
    var gen = tstInfo.children.filter(function (c) { return isUniversal(c, 24); })[0];
    return gen ? time(gen) : null;
  }

  function parseSigner(signerNode) {
    var ch = signerNode.children;
    var sid = ch[1];
    var signed = readAttributes(ch.filter(function (c) { return isContext(c, 0); })[0]);
    var unsigned = readAttributes(ch.filter(function (c) { return isContext(c, 1); })[0]);
    var signingTime = signed['1.2.840.113549.1.9.5'];
    var token = unsigned['1.2.840.113549.1.9.16.2.14'];
    var tsTime = null;
    if (token) {
      try { tsTime = timestampTime(token); } catch (e) { tsTime = null; }
    }
    return {
      serialNumber: isUniversal(sid, 16) ? hex(value(sid.children[1])).replace(/^00/, '') : null,
      signingTime: signingTime ? time(signingTime) : null,
      hasTimestamp: Boolean(token),
      timestampTime: tsTime
    };
  }

  function dumpTree(node, depth, lines) {
    var pad = new Array(depth + 1).join('  ');
    var name = node.cls === 0
      ? (UNIVERSAL_NAMES[node.num] || 'UNIVERSAL ' + node.num)
      : (node.cls === 2 ? '[' + node.num + ']' : 'tag ' + node.cls + ':' + node.num);
    var line = pad + name;
    if (!node.constructed) {
      var preview = '';
      if (node.cls === 0 && node.num === 6) {
        var o = oid(node);
        preview = o + (OID_NAMES[o] ? ' (' + OID_NAMES[o] + ')' : '');
      } else if (node.cls === 0 && node.num === 2) {
        preview = hex(value(node));
      } else if (node.cls === 0 && (node.num === 23 || node.num === 24 || [12, 19, 20, 22, 30].indexOf(node.num) !== -1)) {
        preview = text(node);
      } else {
        preview = (node.valueEnd - node.valueStart) + ' байт';
      }
      if (preview.length > 80) preview = preview.slice(0, 80) + '…';
      line += '  ' + preview;
    }
    lines.push(line);
    (node.children || []).forEach(function (c) { dumpTree(c, depth + 1, lines); });
    return lines;
  }

  function inspectPkcs7(base64) {
    var bytes = base64ToBytes(base64);
    if (bytes.length === 0) throw new Error('Пустые данные');
    var root = readNode(bytes, 0);
    var sd = signedDataOf(root);

    var certsNode = sd.children.filter(function (c) { return isContext(c, 0); })[0];
    var signerInfos = sd.children[sd.children.length - 1];
    var content = encapsulatedContent(sd);

    return {
      size: bytes.length,
      detached: content.bytes === null,
      contentType: OID_NAMES[content.contentType] || content.contentType,
      content: content.bytes,
      contentText: content.bytes ? decodeText(content.bytes) : null,
      certificates: certsNode ? certsNode.children.map(parseCertificate) : [],
      signers: signerInfos.children.map(parseSigner),
      tree: dumpTree(root, 0, []).join('\n')
    };
  }

  global.inspectPkcs7 = inspectPkcs7;
})(this);
