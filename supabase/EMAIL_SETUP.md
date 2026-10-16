# Почта подтверждения mylinks.bar

Шаблон письма находится в `supabase/templates/confirmation.html`. Его тема: «Подтвердите email — mylinks.bar». В письме есть фирменный знак, короткое объяснение и кнопка с `{{ .ConfirmationURL }}`.

Чтобы письма отправлялись от mylinks.bar, настройте SMTP в Supabase:

1. Подключите SMTP-провайдера и подтвердите домен `mylinks.bar`. Добавьте DNS-записи SPF, DKIM и DMARC, которые выдаст провайдер.
2. В Supabase откройте **Authentication → SMTP Settings**, включите Custom SMTP и заполните хост, порт, пользователя и пароль провайдера.
3. Установите From address `no-reply@mylinks.bar` (или другой подтверждённый адрес домена) и Sender name `mylinks.bar`.
4. В **Authentication → Email Templates → Confirm signup** задайте тему из шаблона и вставьте его HTML. Сохраните настройки.

Файл `supabase/config.toml` также указывает на HTML-шаблон для локальной конфигурации Supabase CLI. Обычный `supabase db push` не меняет SMTP-настройки облачного проекта. Для облачной отправки шаги в панели и SMTP-данные провайдера обязательны; без них Supabase продолжит отправлять письма со своего системного адреса.

Используйте отдельный адрес для транзакционных писем. Не передавайте SMTP-пароль в Git или в клиентский код.

## Восстановление пароля (PR по issue #57)

Перед выпуском владелец вручную настраивает в облачном Supabase:

1. **Authentication → URL Configuration → Redirect URLs:** добавить `https://mylinks.bar/auth/reset`.
2. **Authentication → Email Templates → Reset Password:** тема «Сброс пароля — mylinks.bar» и HTML из `supabase/templates/recovery.html`.

Письмо ведёт на `https://mylinks.bar/auth/reset#token_hash={{ .TokenHash }}&type=recovery`. Проверка `verifyOtp` происходит только в браузере после открытия страницы. Не заменяйте эту ссылку на `{{ .ConfirmationURL }}`: почтовые сканеры могут открыть её до пользователя и израсходовать токен. Файл `config.toml` обеспечивает шаблон для локальной конфигурации; облачные настройки он автоматически не обновляет.
