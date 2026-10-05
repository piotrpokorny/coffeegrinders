# Przelicznik młynków

Darmowa aplikacja (PWA) do przeliczania nastawów mielenia między młynkami do kawy.
Działa w przeglądarce i po „Dodaj do ekranu głównego” jak aplikacja na telefonie, także offline.

- **Przelicz** – nastaw z przepisu (np. KINGrinder K6 `2.30`) → odpowiednik na Twoim młynku.
- **Mój młynek** – zapamiętywany w przeglądarce (gwiazdka), bez zakładania konta.
- **Młynki** – 50 modeli z bazy, z oznaczeniem pewności danych A/B/C.
- **Uzupełnij dane** – społeczność proponuje poprawki i nowe młynki (ze źródłem), moderator zatwierdza.

## Jak liczymy

Nastaw → indeks pozycji na skali → szacowany rozmiar cząstek
`µm = min + indeks × (max − min) / (pozycje − 1)` → najbliższa pozycja na młynku docelowym.
µm/klik (przesunięcie żaren) jest pokazywane informacyjnie, ale nie służy do przeliczeń.
Pewność wyniku = słabsza z pewności obu młynków.

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

Testy: `npm test`. Bez zmiennych Supabase aplikacja działa na wbudowanej bazie `public/grinders.json`.

## Dane

Źródłem startowym jest `scripts/mlynki_do_kawy_baza.xlsx`. Po zmianie arkusza:

```bash
npm run import-data
```

To odświeża `public/grinders.json` i `supabase/seed.sql`. Typy skali dla każdego modelu są w `scripts/import_xlsx.py` (`SCALES`).

## Supabase (zgłoszenia i moderacja)

1. Załóż darmowy projekt na supabase.com.
2. SQL Editor → uruchom `supabase/migrations/001_init.sql`, potem `supabase/seed.sql`.
3. Authentication → Users → dodaj użytkownika (e-mail moderatora), potem w SQL:
   `insert into moderators (user_id) select id from auth.users where email = 'TWOJ@EMAIL';`
4. Authentication → URL Configuration → dodaj adres strony (np. `https://piotrpokorny.github.io/coffeegrinders/`) do *Redirect URLs*.
5. Skopiuj *Project URL* i *anon/publishable key* do `.env.local` (lokalnie) oraz do GitHub → Settings → Secrets and variables → Actions → **Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Panel moderatora: `…/#/mod` (logowanie linkiem z e-maila).
Ochrona przed spamem: pole-pułapka w formularzu, limit 5 zgłoszeń/godz. z jednego IP i 300/dobę (trigger w bazie).

## Deploy

Push do gałęzi `main` → GitHub Actions buduje i publikuje na GitHub Pages
(Settings → Pages → Source: **GitHub Actions**).
