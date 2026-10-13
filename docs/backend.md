# Backend для eimzo-ts

Что должен сделать backend, чтобы работали `login()` и `signDocument()`. Примеры на Java
(Spring Boot 3), но протокол подходит для любого языка.

Библиотека работает только в браузере. Подпись **проверяет** e-imzo-server (jar от НИЦ НТ,
нужны договор и VPN-ключ). Ваш backend стоит между браузером и e-imzo-server.

```
браузер (eimzo-ts) ──► ваш backend ──► e-imzo-server :8080 ──► VPN НИЦ НТ (OCSP, метки времени)
        ▲
        └── E-IMZO на ПК пользователя (ws://127.0.0.1:64646)
```

## Эндпоинты

Адреса любые, их указывают в `createFetchBackend`. Ниже — адреса из примера в README.

| Ваш эндпоинт | Что делает | e-imzo-server |
|---|---|---|
| `GET /api/eimzo/challenge` | Отдаёт одноразовый challenge | `GET /frontend/challenge` |
| `POST /api/eimzo/login` | Проверяет подпись challenge, создаёт сессию | `POST /backend/auth` |
| `POST /api/eimzo/timestamp` | Добавляет метку времени к подписи | `POST /frontend/timestamp/pkcs7` |
| `POST /api/documents/{id}/sign` | Ваш: проверяет и сохраняет подписанный документ | `POST /backend/pkcs7/verify/attached` или `/detached` |

Тело `login` и `timestamp` — PKCS#7 в base64, `Content-Type: text/plain`.

### Форматы ответов для `createFetchBackend`

- `challenge`: `{"status": 1, "challenge": "..."}` — можно вернуть ответ e-imzo-server как есть.
- `login`: любой JSON (например, профиль пользователя) — `eimzo.login()` вернёт его во фронтенд как есть,
  поле `status` в нём не проверяется. `204 No Content` (сессия только в cookie) — `null`.
  Пустой или не-JSON ответ `200` (например, HTML-заглушка SPA) считается ошибкой.
- `timestamp`: `{"status": 1, "pkcs7b64": "..."}` — тоже ответ e-imzo-server как есть.
- Ошибка: HTTP 4xx/5xx, сбой сети или, для `challenge` и `timestamp`, поле `status` есть и не равно 1,
  либо `challenge` / `pkcs7b64` пустые. Ответ без `status` принимается. Поле `message` попадёт в текст ошибки `BACKEND_ERROR`.
  Не отправляйте в `message` внутренние детали (stack trace, адреса серверов).

## Заголовки X-Real-IP и Host

Все методы e-imzo-server, кроме `/frontend/challenge`, требуют:

- `X-Real-IP` — IP пользователя. Берите из доверенного прокси, а не из заголовка, который
  прислал браузер: иначе его можно подделать.
- `Host` — домен сайта, на котором пользователь подписывал (`example.uz`). Задайте в конфигурации,
  не копируйте из запроса.

**Подвох Java:** `java.net.http.HttpClient` и `HttpURLConnection` не дают поставить заголовок
`Host`. Используйте Apache HttpClient 5 (`org.apache.httpcomponents.client5:httpclient5` —
Spring `RestClient` подхватит его сам) или запустите JVM с
`-Djdk.httpclient.allowRestrictedHeaders=host` (для `HttpClient`) /
`-Dsun.net.http.allowRestrictedHeaders=true` (для `HttpURLConnection`).

## Пример: Spring Boot

```java
@Configuration
class EimzoConfig {
    @Bean
    RestClient eimzoServer(@Value("${eimzo.server-url}") String url) {
        return RestClient.builder().baseUrl(url).build(); // http://e-imzo-server:8080
    }
}

@RestController
@RequestMapping("/api/eimzo")
class EimzoController {
    private static final String PINFL = "1.2.860.3.16.1.2";
    private static final String INN = "1.2.860.3.16.1.1";

    private final RestClient eimzo;
    private final UserService users;
    private final String siteHost;

    EimzoController(RestClient eimzo, UserService users, @Value("${eimzo.site-host}") String siteHost) {
        this.eimzo = eimzo;
        this.users = users;
        this.siteHost = siteHost; // example.uz
    }

    @GetMapping("/challenge")
    ResponseEntity<JsonNode> challenge() {
        JsonNode body = eimzo.get().uri("/frontend/challenge").retrieve().body(JsonNode.class);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @PostMapping(value = "/login", consumes = MediaType.TEXT_PLAIN_VALUE)
    UserDto login(@RequestBody String pkcs7, HttpServletRequest request) {
        JsonNode res = post("/backend/auth", pkcs7, request);
        int status = res.path("status").asInt();
        if (status == -1) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Повторите позже");
        if (status != 1) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, authMessage(status));

        JsonNode subject = res.path("subjectCertificateInfo").path("subjectName");
        String pinfl = subject.path(PINFL).asText("");
        String tin = subject.path(INN).asText(subject.path("UID").asText(""));
        User user = users.findByPinflOrTin(pinfl, tin)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "Пользователь не зарегистрирован"));

        request.changeSessionId(); // защита от фиксации сессии
        // ...вход через Spring Security (SecurityContext) или выдача JWT
        return UserDto.of(user);
    }

    @PostMapping(value = "/timestamp", consumes = MediaType.TEXT_PLAIN_VALUE)
    JsonNode timestamp(@RequestBody String pkcs7, HttpServletRequest request) {
        return post("/frontend/timestamp/pkcs7", pkcs7, request);
    }

    private JsonNode post(String path, String pkcs7, HttpServletRequest request) {
        return eimzo.post().uri(path)
                .header("X-Real-IP", request.getRemoteAddr()) // за прокси: server.forward-headers-strategy=native
                .header("Host", siteHost)
                .contentType(MediaType.TEXT_PLAIN)
                .body(pkcs7)
                .retrieve()
                .body(JsonNode.class);
    }

    private static String authMessage(int status) {
        return switch (status) {
            case -5 -> "Проверьте дату и время на компьютере";
            case -10 -> "Подпись недействительна";
            case -11, -12 -> "Сертификат недействителен";
            case -20 -> "Время входа истекло, попробуйте ещё раз";
            default -> "Не удалось войти по ЭЦП";
        };
    }
}
```

`application.properties`:

```properties
eimzo.server-url=http://e-imzo-server:8080
eimzo.site-host=example.uz
server.forward-headers-strategy=native
```

### Статусы `/backend/auth`

| status | Значение | Что делать |
|---|---|---|
| 1 | Успешно | Найти пользователя по ПИНФЛ/ИНН, открыть сессию |
| -1 | Не удалось проверить статус сертификата (часто нет VPN) | 503, вход не выполнять, проверить `/ping` и VPN |
| -5 | Время подписи вне окна (5 минут) | Попросить проверить часы на ПК |
| -10 | Подпись недействительна | 401 |
| -11, -12 | Сертификат недействителен (на дату подписи) | 401 |
| -20 | Challenge не найден или истёк (120 с) | Повторить вход |
| -24, -25 | Политика сертификата / УЦ не разрешены | 401 |

## Подписание документа

Фронтенд:

```ts
const pkcs7 = await eimzo.signDocument(documentText); // подпись + метка времени
await fetch(`/api/documents/${id}/sign`, { method: 'POST', body: pkcs7 });
```

Backend:

1. Отправьте PKCS#7 в `/backend/pkcs7/verify/attached` (для detached —
   `/backend/pkcs7/verify/detached`, тело `документBase64|pkcs7`).
2. Проверьте **каждого** подписанта в `pkcs7Info.signers`: `verified`, `certificateVerified`,
   `certificateValidAtSigningTime` равны `true`, `revokedStatusInfo` пуст.
3. Сравните `pkcs7Info.documentBase64` с документом, который вы ожидали. Подписан должен быть
   ваш документ, а не присланный клиентом текст.
4. Проверьте, что ПИНФЛ/ИНН подписанта совпадает с пользователем сессии.
5. Требуйте метку времени. `signingTime` берётся из часов ПК пользователя и может быть подделан.
6. Защитите от повторной отправки: включите в документ уникальный ID и сохраняйте его один раз.
7. Сохраните PKCS#7 и ответ проверки. PKCS#7 содержит ПИНФЛ и другие персональные данные —
   храните как персональные данные.

`status = -1` при проверке — это сбой инфраструктуры (VPN, OCSP), а не плохая подпись:
не принимайте документ и предложите повторить позже.

## Безопасность

- Методы `/backend/*` e-imzo-server не должны быть доступны из интернета — только вашему backend.
- Ответ `/frontend/challenge` не кешировать.
- После входа — новый ID сессии; на `login`, `timestamp` и подпись документа — CSRF-защита,
  если используете cookie (`createFetchBackend({ init: { headers: { 'X-XSRF-TOKEN': ... } } })`).
- Не логируйте PKCS#7 и ответы проверки целиком: в них персональные данные.
- Тестовые ключи проверяются только тестовым e-imzo-server (тестовый VPN), промышленные —
  только промышленным. Ошибка `ocsp url is disallowed` обычно значит, что они перепутаны.
