# win-amp.pl

Klasyczny **Winamp 2 w przeglądarce**: ten sam wygląd, te same skórki i to samo działanie, bez instalowania czegokolwiek. Serwis działa pod adresem **win-amp.pl**.

Autor: [warsztatcyfrowy.pl](https://warsztatcyfrowy.pl)

![Zrzut ekranu](packages/webamp-demo/images/preview.png)

## Funkcje

### Odtwarzanie muzyki

- **Własne pliki** – przeciągnij pliki muzyczne na okno odtwarzacza albo wybierz je przyciskiem _Eject_ (lub w menu _Play → File..._). Obsługiwane są m.in. MP3, FLAC, OGG, WAV, M4A/AAC i Opus.
- **Całe foldery** – po przeciągnięciu folderu odtwarzacz sam wyszukuje w nim utwory, także w podfolderach.
- **Utwory z internetu** – w menu _LIST OPTS → ADD URL_ podajesz adres pliku lub listy odtwarzania.
- **Informacje o utworze** – wykonawca, tytuł i czas trwania są odczytywane z tagów pliku i wyświetlane na przewijanym pasku.
- **Tytuł karty** przeglądarki pokazuje aktualnie grany utwór, a sterowanie z klawiatury multimedialnej i z ekranu blokady telefonu działa jak w zwykłym odtwarzaczu.

### Lista odtwarzania

- **Wyszukiwanie utworu** (_Jump to file_) – klawisz **J** otwiera wyszukiwarkę: wpisz fragment nazwy i odtwórz wybrany utwór.
- **Zapisywanie i wczytywanie list** – _LIST OPTS → SAVE LIST / LOAD LIST_. Listy zapisują się jako pliki `.m3u8`, które otwiera również prawdziwy Winamp.
- **Pamięć plików** – aplikacja pamięta dodane wcześniej pliki, więc po ponownym otwarciu strony lista wraca (czasem po kliknięciu _Przywróć_ i zgodzie na dostęp do plików), a zapisana lista odnajduje utwory bez ponownego wybierania ich z dysku.
- Sortowanie, mieszanie (_Shuffle_), powtarzanie (_Repeat_), zaznaczanie i usuwanie utworów – jak w oryginale.

### Wygląd

- **Skórki Winampa** (`.wsz`) – kilka skórek leży na pulpicie strony (kliknij dwukrotnie, żeby włączyć). Własną skórkę wystarczy przeciągnąć na odtwarzacz.
- **Korektor graficzny** z presetami, także wczytywanymi z plików `.eqf` Winampa.
- **Wizualizacja Milkdrop** – psychodeliczne animacje w rytm muzyki, z możliwością przełączania na pełny ekran.
- **Tryb podwójnego rozmiaru**, przesuwanie i dokowanie okien, animowane kursory ze skórek.
- **Telefony i małe ekrany** – interfejs sam dopasowuje się do szerokości ekranu, a lista odtwarzania wypełnia resztę miejsca.

### Aplikacja na komputerze

W Chrome lub Edge stronę można zainstalować jako aplikację (menu ⋮ → _Zainstaluj win-amp.pl jako aplikację_). Otwiera się wtedy we własnym oknie, a zapisywanie i wczytywanie list działa bezpośrednio na plikach na dysku.

## Uruchomienie u siebie

Potrzebne są Node.js 22 i pnpm 9.

```bash
pnpm install   # instalacja zależności
pnpm start     # serwer deweloperski z podglądem na żywo
pnpm build     # wersja produkcyjna w packages/webamp-demo/dist
```

## Publikacja

Strona aktualizuje się sama: każda zmiana wysłana na gałąź `master` uruchamia w GitHub Actions workflow _Publikacja strony na GitHub Pages_ (`.github/workflows/deploy-pages.yml`), który buduje stronę i ją publikuje. Można go też uruchomić ręcznie w zakładce _Actions_ przyciskiem _Run workflow_.

## Struktura repozytorium

- `packages/webamp-demo` – strona win-amp.pl (pulpit, skórki, zapisywanie list, pamięć plików).
- `packages/webamp` – silnik odtwarzacza: okna, skórki, korektor, lista odtwarzania.
- `packages/ani-cursor` – obsługa animowanych kursorów `.ani` ze skórek.
- `packages/winamp-eqf` – odczyt i zapis presetów korektora `.eqf`.

## Licencja

Kod jest udostępniony na licencji MIT (plik [LICENSE.txt](LICENSE.txt)). Serwis powstał na bazie projektu open source Webamp autorstwa Jordana Eldredge'a; zgodnie z licencją MIT jego informacja o prawach autorskich pozostaje w pliku licencji. Nazwa i wygląd Winampa należą do ich właścicieli.
