# Logging Rules (central-server)

Logs are the primary debugging tool here (there is no `src/test`). The convention **mirrors the
ai-service** so one user action reads the same way in both services' logs and can be traced across
them. Format is plain text, not JSON — keep it that way so the two are diffable side by side.

**The shape of a request.** Every request produces these lines, all carrying the same id:

```text
INFO [283ff320] RequestIdFilter        : Request received      ← + indented JSON envelope (incl. body)
WARN [283ff320] GlobalExceptionHandler : Request failed | 404 …  ← only on error; carries the stack trace
INFO [283ff320] ResponseLoggingAdvice  : Response sent         ← + envelope { request_id, status_code, body }
INFO [283ff320] RequestIdFilter        : <-- GET /… 404 (11ms)
```

**Boundary logging is already built — do not re-implement it per endpoint.**
`common/web/RequestIdFilter` (request in + completion), `common/web/ResponseLoggingAdvice`
(response body out), and `common/exception/GlobalExceptionHandler` (errors) cover every endpoint
automatically. A new controller needs **no** logging code to get all of the above.

- The id lives in the SLF4J **MDC** (`RequestIdFilter.MDC_KEY`) and is rendered on every line by
  `logging.pattern.level` in `application.yml`. Any `log.info(...)` anywhere in the request is
  correlated for free — never thread a request id through method parameters.
- It is echoed to the client as `X-Request-Id` and forwarded to downstream services as
  `X-Correlation-Id` (`common/http/CorrelationIdInterceptor`), which is the header the ai-service
  reads. `HttpClientFactory` wires this into every `RestClient` — build outbound clients through it.
- Async work must carry the MDC across threads (`ChatExecutorConfig`'s `TaskDecorator` does this for
  the chat stream). A new executor needs the same decorator or its logs lose the id.

**Never buffer the response to log it.** Do **not** add `ContentCachingResponseWrapper` (or any
response-wrapping filter). It would stall the SSE chat stream — the client would receive nothing
until generation finished — and would pull whole media files (up to 25MB) into memory. Response
bodies are logged from `ResponseBodyAdvice`, which sees the object *before* serialization. The
non-JSON endpoints are handled deliberately:

| Endpoint | Logged as |
| --- | --- |
| SSE streams (`/chats/send`, notes/diagram AI routes) | frames accumulated in the controller, logged once on completion as a JSON **array** |
| `POST /audio/speech`, `GET /media/{id}/file` (`byte[]`) | a **byte count**, never the bytes |
| everything else (JSON) | the body as a JSON **object** |

**Never log raw bytes or secrets.** Multipart bodies are logged as a summary
(`<multipart/form-data, content-length=N>`) and the stream is left unread — reading it would break
the upload. Request headers are an explicit **whitelist** in `common/web/LogFormat`; keep it a
whitelist so credentials can't leak in. (Base64 media exists only on the *outbound* path to the
model, built in `ChatService`, and never passes through the logging boundary — central-server stores
and logs the media **URL/id**, not the bytes.)

**Errors are logged once.** Throw from services; let `GlobalExceptionHandler` log the stack trace at
the boundary. Do **not** `log.error(ex)` in a service and then rethrow — that duplicates the trace.
The one exception: when the operation knows something the boundary cannot (*which* model, *which*
file), log a contextual `WARN` at the site and rethrow, leaving the stack trace to the boundary:

```java
log.warn("Failed to load AI-service model '{}' after {}ms: {}", name, elapsed, ex.getMessage());
throw ex;   // GlobalExceptionHandler logs the stack trace, once
```

Best-effort operations that **swallow** their exception (e.g. the unload calls) must log the failure
themselves — nothing propagates to the boundary.

**Slow or external operations log intent → outcome, with a duration**, so a hung call is visible
while it is still hanging rather than only in hindsight:

```text
Loading AI-service model 'whisper-large-v3'...
Loaded AI-service model 'whisper-large-v3' (1290ms)
```

Applies to model load/unload (`AiServiceClient`, `OllamaClient`) and media upload (`MediaService`).
Use `private static final Logger log = LoggerFactory.getLogger(X.class)` — there is **no Lombok** in
this project, so no `@Slf4j`.
