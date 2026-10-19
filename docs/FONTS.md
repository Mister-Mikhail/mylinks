# Локальные шрифты

В `src/fonts.css` используются WOFF2 из `public/fonts`. Для каждого семейства проверен открытый текст лицензии OFL в официальном репозитории Google Fonts (16.10.2026). Файлы загружаются с собственного домена, сторонний CDN не используется.

| Семейство | Лицензия |
|---|---|
| Manrope | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt) |
| Arimo | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/arimo/OFL.txt) |
| PT Sans | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/ptsans/OFL.txt) |
| Comfortaa | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/comfortaa/OFL.txt) |
| Lora | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/lora/OFL.txt) |
| Roboto Mono | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/robotomono/OFL.txt) |
| Oswald | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/oswald/OFL.txt) |
| Cormorant Garamond | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/cormorantgaramond/OFL.txt) |
| Caveat | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/caveat/OFL.txt) |
| Marck Script | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/marckscript/OFL.txt) |
| Lobster | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/lobster/OFL.txt) |
| Pacifico | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/pacifico/OFL.txt) |
| Ruslan Display | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/ruslandisplay/OFL.txt) |
| Rubik Mono One | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/rubikmonoone/OFL.txt) |
| Press Start 2P | [OFL.txt](https://github.com/google/fonts/blob/main/ofl/pressstart2p/OFL.txt) |

При обновлении бинарных файлов сохраняйте ссылки на лицензию и проверяйте ограничения Reserved Font Name. Эта таблица фиксирует лицензии семейств; 19.10.2026 все 68 WOFF2 и 15 файлов лицензий побайтно сопоставлены с пакетами `@fontsource/*` версии `5.3.0` из npm registry. Бинарные файлы не изменялись.

`public/fonts/provenance.json` фиксирует точный HTTPS-адрес и SHA-256 каждого исходного tarball, путь внутри архива и SHA-256 каждого локального WOFF2/файла лицензии. `tests/font-assets.spec.ts` проверяет контрольные суммы, полноту списка и связь семейств с CSS в обоих проектах Playwright. Поле `verifiedOn` обозначает дату сравнения, а не дату выпуска шрифтов.

Автоматическая повторная сверка: `python3 scripts/verify-font-sources.py` (нужен доступ к npm registry; файлы не меняет).

Для ручной сверки источника скачайте указанный `url`, проверьте `tarballSha256`, прочитайте перечисленные `source` без изменения содержимого и сравните их байты с локальными файлами. Изменение бинарных файлов требует повторной сверки с источником и обновления манифеста.

