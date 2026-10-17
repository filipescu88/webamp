# Strona win-amp.pl

Kod strony win-amp.pl: pulpit ze skórkami, odtwarzacz i dodatki, których nie ma w samym silniku:

- **pamięć plików** (`js/localFiles.ts`) – zapamiętuje dodane utwory, żeby przywrócić listę po ponownym otwarciu strony,
- **zapisywanie i wczytywanie list** `.m3u8` oraz dodawanie adresów URL (`js/playlistListHandlers.ts`),
- **pasek przywracania listy** (`js/RestorePlaylistBar.tsx`),
- **tryb zainstalowanej aplikacji** (`js/appMode.ts`),
- **wizualizacja Milkdrop** (`js/butterchurnOptions.ts`),
- **skórki na pulpicie** (`skins/`, `js/availableSkins.ts`).

Autor: [warsztatcyfrowy.pl](https://warsztatcyfrowy.pl)

## Praca nad stroną

    pnpm start

Uruchamia serwer deweloperski Vite. Silnik z `packages/webamp/js/` jest wczytywany bezpośrednio ze źródeł, więc każdą zmianę od razu widać w przeglądarce.

## Wersja produkcyjna

    pnpm run build   # zapisuje stronę w dist/
    pnpm run serve   # podgląd zbudowanej wersji

## Publikacja

Wystarczy wysłać zmiany na gałąź `master` – GitHub Actions sam zbuduje i opublikuje stronę.
