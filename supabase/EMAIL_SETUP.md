# Почта подтверждения mylinks.bar

Шаблон письма находится в `supabase/templates/confirmation.html`. Его тема: «Подтвердите email — mylinks.bar». В письме есть фирменный знак, короткое объяснение и кнопка с `{{ .ConfirmationURL }}`.

Чтобы письма отправлялись от mylinks.bar, настройте SMTP в Supabase:

1. Подключите SMTP-провайдера и подтвердите домен `mylinks.bar`. Добавьте DNS-записи SPF, DKIM и DMARC, которые выдаст провайдер.
2. В Supabase откройте **Authentication → SMTP Settings**, включите Custom SMTP и заполните хост, порт, пользователя и пароль провайдера.
3. Установите From address `no-reply@mylinks.bar` (или другой подтверждённый адрес домена) и Sender name `mylinks.bar`.
4. В **Authentication → Email Templates → Confirm signup** задайте тему из шаблона и вставьте его HTML. Сохраните настройки.

Файл `supabase/config.toml` также указывает на HTML-шаблон для локальной конфигурации Supabase CLI. Обычный `supabase db push` не меняет SMTP-настройки облачного проекта. Для облачной отправки шаги в панели и SMTP-данные провайдера обязательны; без них Supabase продолжит отправлять письма со своего системного адреса.

Используйте отдельный адрес для транзакционных писем. Не передавайте SMTP-пароль в Git или в клиентский код.
