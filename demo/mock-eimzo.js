/*
 * Имитация E-IMZO для демо без установленного приложения.
 * createMockTransport() передаётся в createEimzo({ transport }) вместо WebSocket.
 *
 * Ключи и сертификат — вымышленные. «Подпись» — правильная по структуре CMS SignedData
 * (документ, сертификат, signingTime, messageDigest), но вместо подписи случайные байты:
 * проверку на e-imzo-server она не пройдёт.
 */
(function (global) {
  'use strict';

  // Самоподписанный сертификат TESTOV TEST, ПИНФЛ 30101900000000, UID 123456789.
  var CERT_B64 =
    'MIICjzCCAjWgAwIBAgIUWlcZzOsAIOUCetZAiiesc8TlACAwCgYIKoZIzj0EAwIwgbUxCzAJBgNVBAYTAlVaMREwDwYDVQQHDAhUT1NIS0VOVDESMBAGA1UECgwJREVNTyBNQ0hKMREwDwYDVQQMDAhESVJFS1RPUjEUMBIGA1UEAwwLVEVTVE9WIFRFU1QxDzANBgNVBAQMBlRFU1RPVjENMAsGA1UEKgwEVEVTVDEZMBcGCgmSJomT8ixkAQEMCTEyMzQ1Njc4OTEbMBkGByqGXAMQAQIMDjMwMTAxOTAwMDAwMDAwMB4XDTI2MTAxMzA2MzYxNloXDTI5MTAxMjA2MzYxNlowgbUxCzAJBgNVBAYTAlVaMREwDwYDVQQHDAhUT1NIS0VOVDESMBAGA1UECgwJREVNTyBNQ0hKMREwDwYDVQQMDAhESVJFS1RPUjEUMBIGA1UEAwwLVEVTVE9WIFRFU1QxDzANBgNVBAQMBlRFU1RPVjENMAsGA1UEKgwEVEVTVDEZMBcGCgmSJomT8ixkAQEMCTEyMzQ1Njc4OTEbMBkGByqGXAMQAQIMDjMwMTAxOTAwMDAwMDAwMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEBqFwX3IEecqmFq26au/D355l5tNi6V7LYHhynyXmTe5y2QMMbr5pavz3TZgrKttMx1feomb4IYO72pkh6PqgyaMhMB8wHQYDVR0OBBYEFM61dF5ounx6VVBG8RfrKK8LV3myMAoGCCqGSM49BAMCA0gAMEUCIEBD1pcRwhoeme1KECI8+CLB/FM7ED1WlTvMIaZrjnNbAiEAi0d+QTgim3Mgrcta6S8DfdzLuHpbw05gDrldQw4nzr0=';

  // Так E-IMZO отдаёт alias: в нижнем регистре, даты «ГГГГ.ММ.ДД ЧЧ:ММ:СС».
  var CERTIFICATES = [
    {
      disk: 'C:\\', path: 'DSKEYS', name: 'DS301019000000000001',
      alias: 'cn=testov test,name=test,surname=testov,l=toshkent,c=uz,o=demo mchj,t=direktor,uid=123456789,' +
        '1.2.860.3.16.1.2=30101900000000,serialnumber=5a5719cceb0020e5027ad6408a27ac73c4e50020,' +
        'validfrom=2026.10.13 06:36:16,validto=2029.10.12 06:36:16'
    },
    {
      disk: 'C:\\', path: 'DSKEYS', name: 'DS302029000000000002',
      alias: 'cn=eskiyev eski,name=eski,surname=eskiyev,c=uz,uid=987654321,1.2.860.3.16.1.2=30202900000000,' +
        'serialnumber=1f2e3d,validfrom=2021.01.01 00:00:00,validto=2023.01.01 23:59:59'
    }
  ];

  // ---------- DER ----------

  function concat(parts) {
    var total = parts.reduce(function (s, p) { return s + p.length; }, 0);
    var out = new Uint8Array(total);
    var offset = 0;
    parts.forEach(function (p) { out.set(p, offset); offset += p.length; });
    return out;
  }

  function tlv(tag, parts) {
    var body = concat(parts);
    var len = body.length;
    var lenBytes;
    if (len < 0x80) {
      lenBytes = [len];
    } else {
      lenBytes = [];
      for (var n = len; n > 0; n = Math.floor(n / 256)) lenBytes.unshift(n & 0xff);
      lenBytes.unshift(0x80 | lenBytes.length);
    }
    return concat([new Uint8Array([tag].concat(lenBytes)), body]);
  }

  function oid(dotted) {
    var parts = dotted.split('.').map(Number);
    var bytes = [parts[0] * 40 + parts[1]];
    parts.slice(2).forEach(function (n) {
      var chunk = [n & 0x7f];
      for (n = Math.floor(n / 128); n > 0; n = Math.floor(n / 128)) chunk.unshift(0x80 | (n & 0x7f));
      bytes = bytes.concat(chunk);
    });
    return tlv(0x06, [new Uint8Array(bytes)]);
  }

  var seq = function () { return tlv(0x30, Array.prototype.slice.call(arguments)); };
  var set = function () { return tlv(0x31, Array.prototype.slice.call(arguments)); };
  var int = function (n) { return tlv(0x02, [new Uint8Array([n])]); };
  var octets = function (bytes) { return tlv(0x04, [bytes]); };

  function utcTime(date) {
    var s = date.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';
    return tlv(0x17, [new TextEncoder().encode(s)]);
  }

  /** Срез исходных байтов TLV по позиции: { start, valueStart, end }. */
  function readTlv(buf, pos) {
    var start = pos;
    pos++;
    var len = buf[pos++];
    if (len & 0x80) {
      var n = len & 0x7f;
      len = 0;
      for (var i = 0; i < n; i++) len = len * 256 + buf[pos++];
    }
    return { start: start, valueStart: pos, end: pos + len };
  }

  function base64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToBase64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  var CERT = base64ToBytes(CERT_B64);

  /** issuer и serialNumber из сертификата — для SignerInfo.sid. */
  function issuerAndSerial() {
    var tbs = readTlv(CERT, readTlv(CERT, 0).valueStart);
    var version = readTlv(CERT, tbs.valueStart);
    var serial = readTlv(CERT, version.end);
    var sigAlg = readTlv(CERT, serial.end);
    var issuer = readTlv(CERT, sigAlg.end);
    return seq(CERT.subarray(issuer.start, issuer.end), CERT.subarray(serial.start, serial.end));
  }

  async function sha256(bytes) {
    if (global.crypto && crypto.subtle) return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return new Uint8Array(32);
  }

  async function fakePkcs7(content, detached) {
    var SHA256 = seq(oid('2.16.840.1.101.3.4.2.1'));
    var signedAttrs = [
      seq(oid('1.2.840.113549.1.9.3'), set(oid('1.2.840.113549.1.7.1'))),
      seq(oid('1.2.840.113549.1.9.5'), set(utcTime(new Date()))),
      seq(oid('1.2.840.113549.1.9.4'), set(octets(await sha256(content))))
    ];
    var signature = crypto.getRandomValues(new Uint8Array(70));
    var signerInfo = seq(
      int(1),
      issuerAndSerial(),
      SHA256,
      tlv(0xa0, signedAttrs),
      seq(oid('1.2.840.10045.4.3.2')),
      octets(signature)
    );
    var encap = detached
      ? seq(oid('1.2.840.113549.1.7.1'))
      : seq(oid('1.2.840.113549.1.7.1'), tlv(0xa0, [octets(content)]));
    var signedData = seq(int(1), set(SHA256), encap, tlv(0xa0, [CERT]), set(signerInfo));
    return bytesToBase64(seq(oid('1.2.840.113549.1.7.2'), tlv(0xa0, [signedData])));
  }

  // ---------- E-IMZO ----------

  function createMockTransport(options) {
    var delay = (options && options.delayMs) || 400;
    var loaded = {};
    var counter = 0;
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

    var handlers = {
      version: function () { return { success: true, major: '6', minor: '3' }; },
      apikey: function () { return { success: true }; },
      'pfx.list_all_certificates': function () { return { success: true, certificates: CERTIFICATES }; },
      'idcard.list_readers': function () { return { success: true, readers: [] }; },
      'baikey.list_tokens': function () { return { success: true, tokens: [] }; },
      'ckc.list_ckc': function () { return { success: true, devices: [] }; },
      'pfx.load_key': function (args) {
        var keyId = 'mock-' + (++counter);
        loaded[keyId] = args[3];
        return { success: true, keyId: keyId };
      },
      'pfx.verify_password': function () { return { success: true }; },
      'pfx.unload_key': function (args) {
        if (!loaded[args[0]]) return { success: false, status: -1014, reason: "Идентификатор ключа типа 'PFX_KEY_STORE' не найден" };
        delete loaded[args[0]];
        return { success: true };
      },
      'pkcs7.create_pkcs7': async function (args) {
        if (!loaded[args[1]]) return { success: false, status: -1010, reason: 'Ключ по идентификатору не найден' };
        await wait(delay); // «пользователь вводит пароль»
        return { success: true, pkcs7_64: await fakePkcs7(base64ToBytes(args[0]), args[2] === 'yes') };
      }
    };

    return async function (request) {
      var name = request.plugin ? request.plugin + '.' + request.name : request.name;
      var handler = handlers[name];
      if (!handler) return { success: false, status: 0, reason: 'Функция не найдена или версия E-IMZO устарела. Обновите E-IMZO.' };
      return handler(request.arguments || []);
    };
  }

  global.createMockTransport = createMockTransport;
})(this);
