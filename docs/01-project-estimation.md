# Projekt becslés – Kártyaértékelő és Autentikációs Platform

**Dokumentum verzió:** 1.1
**Dátum:** 2026. június 16.
**Készítette:** Fejlesztői csapat (egyfős, senior full-stack fejlesztő)
**Megrendelő részére**

---

## Tartalomjegyzék

1. [Projekt áttekintés](#1-projekt-áttekintés)
2. [Funkcionális követelmények](#2-funkcionális-követelmények)
3. [Becsült munkaórák modulonként](#3-becsült-munkaórák-modulonként)
4. [Rétegszerinti bontás](#4-rétegszerinti-bontás)
5. [Mérföldkövek és idővonal](#5-mérföldkövek-és-idővonal)
6. [Infrastruktúra költségek](#6-infrastruktúra-költségek)
7. [Órabér és teljes költség](#7-órabér-és-teljes-költség)
8. [Kockázatok és feltételezések](#8-kockázatok-és-feltételezések)

---

## 1. Projekt áttekintés

### 1.1 A projekt célja

A megrendelő egy **PSA / Beckett típusú online kártyaértékelő (grading) és autentikációs platformot** kíván létrehozni gyűjthető kártyák (TCG – Trading Card Games, pl. Pokémon, Magic: The Gathering, valamint sportkártyák) számára. A platform lehetővé teszi a felhasználók számára, hogy kártyáikat beküldjék hitelesítésre és állapotértékelésre, nyomon kövessék a folyamatot, és böngésszék a már értékelt kártyák statisztikáit.

A rendszer két fő szolgáltatás köré épül:

- **Grading (állapotértékelés)** – a kártya fizikai állapotának szakértői pontozása (skálázott értékelés).
- **Autentikálás (hitelesítés)** – a kártya eredetiségének megerősítése.

> *„Cards és Autentic – minden, ami alá van írva.”* – azaz minden olyan kártya, amelyet a platform szakértői hitelesítettek és/vagy értékeltek, bekerül a nyilvános adatbázisba.

### 1.2 Főbb jellemzők

- Nyilvános landing page **Trending Cards** szekcióval és bemutató szöveggel.
- Részletes **grading beküldési folyamat** (több kártya egyszerre, opcionális képfeltöltés).
- **Online fizetés** (Stripe) a beküldési / szolgáltatási díjak rendezésére.
- **Pop Report** (Population Report) – statisztika arról, hogy egy adott kártyából hány darab kapott adott értékelést.
- **FedEx integráció** a fizikai kártyák szállításának és logisztikájának kezelésére.
- Statikus tartalmi oldalak: **How it works**, **FAQ**.
- Prémium, **fekete–fehér–arany** dizájn, amely a PSA/Beckett presztízsét tükrözi.

### 1.3 Célközönség

- Kártyagyűjtők és befektetők
- Kártyakereskedők és aukciósházak
- TCG- és sportkártya-piaci szereplők

### 1.4 Technológiai megközelítés

Modern, production-grade web-stack, felhőalapú infrastruktúrával, kereshető adatbázissal (Meilisearch), menedzselt backenddel (Supabase) és objektumtárolóval (Cloudflare R2). Az online fizetést **Stripe** kezeli. A fejlesztést **egy fő senior full-stack fejlesztő** végzi.

---

## 2. Funkcionális követelmények

A követelményeket logikai modulokba (és egyúttal fejlesztési fázisokba) bontottuk.

### M0 – Alapozás és infrastruktúra
- Projekt-váz felállítása, kódbázis, CI/CD pipeline
- Supabase projekt(ek) konfigurálása (adatbázis séma, autentikáció, RLS szabályok)
- Cloudflare R2 objektumtároló bekötése (képfeltöltés kártyákról)
- Meilisearch telepítése és konfigurálása a kereső szolgáltatáshoz
- Környezetek szétválasztása (Prod / Test)

### M1 – Dizájnrendszer és nyilvános oldalak
- Dizájnrendszer kialakítása: színpaletta (fekete / fehér / arany), tipográfia, komponenskönyvtár
- **Landing page**: Trending Cards szekció + bemutató szöveg, CTA-k
- **How it works** oldal (a folyamat lépésről lépésre)
- **FAQ** oldal (gyakran ismételt kérdések, bővíthető tartalomkezeléssel)
- Reszponzív megjelenés (mobil / tablet / desktop)
- Fejléc, lábléc, navigáció

### M2 – Felhasználói fiók és autentikáció
- Regisztráció / bejelentkezés / jelszó-visszaállítás (Supabase Auth)
- Felhasználói profil és beállítások
- Tranzakciós e-mailek (megerősítés, állapotértesítések) – e-mail küldés Cloudflare-en keresztül
- Jogosultságkezelés (felhasználó / admin szerepkörök)

### M3 – Grading beküldési folyamat
- **Beküldési űrlap (multi-card):** több kártya hozzáadása dinamikusan, „plusz” gombbal
- Kártyánként megadható mezők:
  - Név (kötelező)
  - Szett (kötelező)
  - Szett szám (kötelező)
  - Kiadási év (kötelező)
  - Kép (opcionális, R2-be feltöltve)
- Szolgáltatás kiválasztása: Grading és/vagy Autentikálás
- Beküldés összegzése, ár- és átfutási idő becslés
- Beküldött rendelés státusz-követése a felhasználói fiókban

### M4 – Pop Report (Population Report)
- Értékelt kártyák nyilvános adatbázisa
- Keresés és szűrés (Meilisearch): kártyanév, szett, év, értékelés szerint
- **Pop Report nézet:** kártyánként megjelenítve, melyik értékelési fokozatból hány darab létezik
- Kártya-részletoldal (kép, metaadatok, értékelési eloszlás)

### M5 – Admin / belső értékelési workflow
- Admin felület a beérkező rendelések kezelésére
- Értékelési és hitelesítési folyamat rögzítése (grade kiosztása, állapot frissítése)
- Pop Report adatbázis automatikus frissítése a véglegesített értékelések alapján
- Belső jegyzetek, állapotnaplózás

### M6 – FedEx integráció és logisztika
- FedEx API integráció: szállítási címke generálás, díjkalkuláció
- Csomag-követés (tracking) be- és kimenő irányban
- Szállítási státuszok megjelenítése a felhasználónak
- Hibakezelés és visszacsomagolási folyamat

### M7 – Online fizetés (Stripe)
- **Stripe Checkout** integráció: a fizetési folyamat a beküldéshez kötve, a kiválasztott szolgáltatás(ok) és kártyaszám alapján számított díjjal
- **Checkout Session** létrehozása szerveroldalon (tételek, összeg, pénznem, metaadatok a rendeléshez)
- **Webhook-végpont:** fizetési események feldolgozása (pl. `checkout.session.completed`, `payment_intent.succeeded` / `payment_intent.payment_failed`), aláírás-ellenőrzés (signing secret), idempotens kezelés
- **Fizetés-megerősítés:** sikeres fizetés után a rendelés állapotának automatikus frissítése (állapotgép), visszaigazoló e-mail; sikertelen / megszakított fizetés kezelése
- **Visszatérítés (refund) kezelése** admin felületről (teljes és részleges), pl. elutasított vagy nem feldolgozható beküldés esetén; a visszatérítés állapotának nyomon követése
- Tranzakciónapló és bizonylat-alapadatok (a számla/nyugta a Stripe oldalán keletkezik)

### M8 – Tesztelés, finomhangolás, élesítés
- End-to-end és funkcionális tesztelés
- Teljesítmény- és biztonsági ellenőrzés
- Hibajavítás, UX-finomhangolás
- Production deploy, monitoring, dokumentáció átadás

---

## 3. Becsült munkaórák modulonként

> Az alábbi becslések egy **senior full-stack fejlesztő** reális, production-grade minőséget célzó munkáját feltételezik. Tartalmazzák a fejlesztést, az egységtesztet és az alap dokumentációt, de a projekt-szintű QA és élesítés külön (M8) sorként szerepel.

| Modul | Megnevezés | Becsült óra |
|------|------------|------------:|
| M0 | Alapozás és infrastruktúra | 56 |
| M1 | Dizájnrendszer és nyilvános oldalak (Landing, How it works, FAQ) | 96 |
| M2 | Felhasználói fiók és autentikáció | 56 |
| M3 | Grading beküldési folyamat (multi-card UI + logika) | 88 |
| M4 | Pop Report (kereső, statisztika, részletoldal) | 80 |
| M5 | Admin / belső értékelési workflow | 80 |
| M6 | FedEx integráció és logisztika | 72 |
| M7 | Online fizetés – Stripe (checkout, webhook, megerősítés, refund) | 50 |
| M8 | Tesztelés, finomhangolás, élesítés | 72 |
| — | Projektmenedzsment, egyeztetés, dokumentáció (~9%) | 60 |
| | **Összesen** | **710** |

### 3.1 Részletesebb bontás a nagyobb modulokra

**M3 – Grading beküldési folyamat (88 óra)**

| Feladat | Óra |
|--------|----:|
| Multi-card űrlap UI (dinamikus hozzáadás/törlés, validáció) | 28 |
| Opcionális képfeltöltés R2-be (előnézet, méretkorlát, kompresszió) | 16 |
| Szolgáltatásválasztás + árkalkuláció + összegzés | 16 |
| Beküldés backend-logika, rendelés entitás, állapotgép | 20 |
| Felhasználói státusz-követő nézet | 8 |

**M4 – Pop Report (80 óra)**

| Feladat | Óra |
|--------|----:|
| Meilisearch index séma, adat-szinkronizáció | 20 |
| Keresés / szűrés UI + backend | 24 |
| Pop Report aggregáció (értékelési eloszlás kártyánként) | 20 |
| Kártya-részletoldal | 16 |

**M6 – FedEx integráció (72 óra)**

| Feladat | Óra |
|--------|----:|
| FedEx API auth, sandbox tesztelés | 16 |
| Címkegenerálás + díjkalkuláció | 24 |
| Tracking / státusz szinkronizáció | 20 |
| Hibakezelés, edge case-ek, dokumentáció | 12 |

**M7 – Online fizetés / Stripe (50 óra)**

| Feladat | Óra |
|--------|----:|
| Stripe Checkout integráció (Checkout Session, frontend fizetési folyamat, díjszámítás) | 14 |
| Webhook-kezelés (esemény-feldolgozás, aláírás-ellenőrzés, idempotencia) | 12 |
| Fizetés-megerősítés és rendelés-állapotgép integráció, visszaigazoló e-mail | 12 |
| Visszatérítés (refund) kezelése (admin + automatikus), hibakezelés, sandbox tesztelés | 12 |

---

## 4. Rétegszerinti bontás

A 710 órás összóra rétegekre vetített megoszlása (a fenti modulokon belüli munkák besorolása alapján):

| Réteg | Tartalom | Becsült óra | Arány |
|------|----------|------------:|------:|
| **Frontend** | UI/UX implementáció, komponensek, oldalak, űrlapok (beküldés, fizetés), reszponzivitás | 265 | ~37% |
| **Backend** | Adatmodell, üzleti logika, API-k, integrációk (FedEx, Stripe, e-mail), Supabase/RLS, Meilisearch | 265 | ~37% |
| **Infrastruktúra / DevOps** | Hetzner/Contabo szerverek, Supabase, R2, Meilisearch deploy, CI/CD, monitoring | 80 | ~11% |
| **Dizájn** | Dizájnrendszer, színpaletta, komponens-tervek, prototípus | 40 | ~6% |
| **PM / QA / dokumentáció** | Egyeztetés, tesztelés-koordináció, átadás | 60 | ~9% |
| | **Összesen** | **710** | **100%** |

> Megjegyzés: mivel a fejlesztést egy fő végzi, a rétegek időben átfedik egymást; a fenti bontás a munka jellegét és nem külön erőforrásokat tükröz.

---

## 5. Mérföldkövek és idővonal

Feltételezés: **napi ~6 hatékony fejlesztői óra**, heti 5 munkanap → kb. **30 óra/hét**. A 710 óra így kb. **24 munkahét ≈ 5,5–6 hónap**.

| # | Mérföldkő | Tartalom | Óra | Becsült időtartam | Kumulált hét |
|---|-----------|----------|----:|------------------|-------------:|
| **MK1** | Alapok & nyilvános oldalak | M0 + M1 (infra, dizájnrendszer, Landing, How it works, FAQ) | 152 | ~5 hét | 5. hét |
| **MK2** | Fiók & beküldési folyamat | M2 + M3 (auth, multi-card grading űrlap) | 144 | ~5 hét | 10. hét |
| **MK3** | Pop Report & kereső | M4 (Meilisearch, statisztikák, részletoldal) | 80 | ~3 hét | 13. hét |
| **MK4** | Admin workflow | M5 (értékelési folyamat, Pop Report frissítés) | 80 | ~3 hét | 16. hét |
| **MK5** | FedEx & logisztika | M6 (szállítás, tracking) | 72 | ~2,5 hét | 18,5. hét |
| **MK6** | Online fizetés | M7 (Stripe checkout, webhook, refund) | 50 | ~1,5 hét | 20. hét |
| **MK7** | Élesítés & átadás | M8 + PM/dok. (QA, finomhangolás, deploy) | 132 | ~4 hét | 24. hét |

**Teljes becsült átfutási idő: kb. 24 hét (≈ 5,5–6 hónap).**

Minden mérföldkő végén bemutató (demo) és megrendelői jóváhagyási pont van. A visszajelzések alapján szükséges módosítások a következő mérföldkő keretében vagy külön egyeztetés szerint kerülnek beépítésre.

```
Hét:  1   3   5   7   9   11  13  15  17  19  21  23  24
MK1  [=========]
MK2            [==========]
MK3                       [======]
MK4                              [======]
MK5                                     [=====]
MK6                                          [===]
MK7                                             [========]
```

---

## 6. Infrastruktúra költségek

> Az árak tájékoztató jellegűek, a 2026-os listaárak alapján. Átváltási árfolyamok: **1 EUR ≈ 400 HUF**, **1 USD ≈ 360 HUF**. A tényleges költség a forgalomtól és tárhelyhasználattól függően változhat.

### 6.1 Havi üzemeltetési költség

**Production környezet**

| Tétel | Specifikáció | Havi díj (≈) | HUF (≈) |
|------|--------------|-------------|--------:|
| Hetzner szerver #1 – Webapp | Cloud CPX31 (4 vCPU / 8 GB) | €16 | 6 400 Ft |
| Hetzner szerver #2 – Szolgáltatások (Meilisearch stb.) | Cloud CPX31 (4 vCPU / 8 GB) | €16 | 6 400 Ft |
| Supabase Pro | Menedzselt Postgres + Auth + Storage | $25 | 9 000 Ft |
| Cloudflare R2 | Objektumtárolás (kártyaképek) + kimenő forgalom | ~$8 | 2 880 Ft |
| E-mail küldés | Tranzakciós e-mailek | ~$5 | 1 800 Ft |
| **Prod összesen** | | | **~26 480 Ft / hó** |

**Test (staging) környezet**

| Tétel | Specifikáció | Havi díj (≈) | HUF (≈) |
|------|--------------|-------------|--------:|
| Contabo szerver | VPS (test/staging) | €6 | 2 400 Ft |
| Supabase | Free / kis Pro | $0–25 | 0 Ft |
| Cloudflare R2 | Test objektumtárolás | ~$3 | 1 080 Ft |
| **Test összesen** | | | **~3 480 Ft / hó** |

**Havi infrastruktúra összesen (Prod + Test): ≈ 29 960 Ft / hó (~30 000 Ft).**

> **Stripe:** a Stripe-nak nincs fix havidíja; a szolgáltató tranzakciónkénti jutalékot számít fel (jellemzően a fizetett összeg százaléka + fix tételdíj), amely a megrendelőt/végfelhasználói díjat terheli, így a fenti havi infrastruktúra-összeget nem növeli.

### 6.2 Egyszeri beállítási (setup) költség

A szerverek, Supabase, R2, Meilisearch és a CI/CD beállítása az **M0 modul** részeként, a fejlesztői órákban (56 óra) szerepel — nincs külön infrastruktúra-setup díj. A Stripe fiók beállítása és a fizetési integráció fejlesztése az **M7 modul** részeként szerepel. Külső szolgáltatásoknál egyszeri kiadás nem merül fel; a domain és esetleges SSL/egyéb tételek a megrendelőt terhelik (~10 000–20 000 Ft/év domain).

### 6.3 Éves szintű becslés

| | Havi | Éves (×12) |
|---|----:|----------:|
| Infrastruktúra | ~30 000 Ft | ~360 000 Ft |
| Domain (kb.) | ~1 500 Ft | ~18 000 Ft |
| **Összesen** | **~31 500 Ft** | **~378 000 Ft** |

---

## 7. Órabér és teljes költség

### 7.1 Órabér

A becslés egy **senior full-stack fejlesztő** munkáját feltételezi, aki teljes körűen (frontend, backend, infra, dizájn) szállítja a projektet. A magyar piacon egy ilyen szintű, production-grade munkát végző szakember reális freelance órabére:

> **Órabér: 18 000 Ft / óra (nettó)**

Ez a magyar senior fejlesztői freelance sáv (kb. 14 000–25 000 Ft/óra) középső tartományába esik, és tükrözi a full-stack + DevOps + dizájn felelősséget.

### 7.2 Teljes fejlesztési költség

| | Óra | Órabér | Költség |
|---|----:|-------:|--------:|
| Fejlesztés (710 óra) | 710 | 18 000 Ft | **12 780 000 Ft** |

> **Teljes egyszeri fejlesztési költség: 12 780 000 Ft + ÁFA.**

### 7.3 Költségsáv (becslési bizonytalanság)

A szoftverfejlesztési becslés természeténél fogva bizonytalanságot hordoz. Reális sáv:

| Forgatókönyv | Óra | Költség |
|--------------|----:|--------:|
| Optimista (−15%) | ~600 | ~10 800 000 Ft |
| **Várható** | **710** | **12 780 000 Ft** |
| Pesszimista (+20%) | ~850 | ~15 300 000 Ft |

### 7.4 Javasolt fizetési ütemezés (mérföldkövekhez kötve)

| Ütem | Esemény | Arány | Összeg (várható) |
|------|---------|------:|----------------:|
| 1 | Szerződéskötés / projektindulás | 20% | 2 556 000 Ft |
| 2 | MK1 átadás (alapok + nyilvános oldalak) | 15% | 1 917 000 Ft |
| 3 | MK2 átadás (fiók + beküldés) | 15% | 1 917 000 Ft |
| 4 | MK3–MK4 átadás (Pop Report + admin) | 25% | 3 195 000 Ft |
| 5 | MK5 átadás (FedEx) | 10% | 1 278 000 Ft |
| 6 | MK6 átadás (online fizetés / Stripe) | 5% | 639 000 Ft |
| 7 | MK7 – végátadás & élesítés | 10% | 1 278 000 Ft |
| | **Összesen** | **100%** | **12 780 000 Ft** |

### 7.5 Üzemeltetési / támogatási opció (külön megállapodás)

Az élesítés után igény esetén havidíjas support (hibajavítás, kisebb módosítások, monitoring) ajánlható, pl. **havi 8–16 óra keretben** elszámolva. Az infrastruktúra havidíja (~30 000 Ft/hó) a megrendelőt terheli, vagy átszámlázásra kerül. A Stripe tranzakciós jutaléka szintén a megrendelőt terheli.

---

## 8. Kockázatok és feltételezések

### 8.1 Feltételezések

1. **Egy fő fejlesztő** végzi a projektet végponttól végpontig (frontend, backend, infra, dizájn).
2. A megrendelő **időben (max. 2–3 munkanapon belül) ad visszajelzést** a mérföldkövekre és a felmerülő kérdésekre.
3. A **dizájn iránymutatás** (fekete/fehér/arany) elegendő ahhoz, hogy a fejlesztő dizájnrendszert építsen; külön, részletes grafikai tervezés (pl. brand identity, logó) NEM része a becslésnek.
4. A **grading skála és üzleti szabályok** (értékelési fokozatok, árképzés, átfutási idők) a megrendelő által definiáltak és a projekt elején rendelkezésre állnak.
5. **FedEx API hozzáférés** (fiók, sandbox, production kulcsok) a megrendelő által biztosított, időben.
6. **Stripe fiók-hozzáférés** (API kulcsok, webhook signing secret, élő és teszt mód) a megrendelő által biztosított, időben; a megrendelő rendelkezik a fizetés-elfogadáshoz szükséges üzleti/jogi feltételekkel (pl. Stripe onboarding).
7. A **tartalmak** (FAQ szövegek, How it works leírások, marketing copy) a megrendelő által biztosítottak.
8. A **harmadik féltől származó szolgáltatások** (Supabase, Hetzner, Contabo, Cloudflare, FedEx, Stripe) elérhetők és stabilan működnek.

### 8.2 Kockázatok és kezelésük

| Kockázat | Hatás | Valószínűség | Kezelés |
|----------|-------|--------------|---------|
| **FedEx integráció bonyolultabb a vártnál** (API korlátok, sandbox eltérések) | Csúszás, +óra | Közepes | Korai prototípus a sandboxban (M6 elején); puffer beépítve |
| **Fizetési integráció edge case-ei** (webhook megbízhatóság, idempotencia, részleges refund, vitatott tranzakciók) | Csúszás, +óra | Közepes | Stripe sandbox/teszt mód korai tesztelése; idempotens webhook-kezelés; tesztkártyák |
| **Scope-bővülés** (új funkciók menet közben) | Költség- és időnövekedés | Magas | Változáskezelési folyamat; mérföldkövenkénti jóváhagyás |
| **Pop Report adatmennyiség és kereső-teljesítmény** nagy adathalmaznál | Teljesítményromlás | Közepes | Meilisearch indexelés korai terheléstesztje |
| **Megrendelői visszajelzés késik** | Idővonal csúszás | Közepes | Mérföldkövenkénti fix demo-időpontok |
| **Üzleti szabályok pontatlan definíciója** (értékelés, árazás) | Újramunka | Közepes | Részletes specifikáció az M0/M2 elején |
| **Infrastruktúra / self-hosted szolgáltatás üzemeltetés** (Meilisearch a Hetzneren) | Üzemeltetési teher | Alacsony–közepes | Automatizált deploy, backup, monitoring az M0-ban |
| **Becslési bizonytalanság** | ±15–20% eltérés | — | Költségsáv (7.3) kommunikálva, mérföldkövenkénti elszámolás |

### 8.3 A becslésen kívül eső tételek (külön egyeztetendő)

- Mobilalkalmazás (natív iOS/Android)
- Többnyelvűség (i18n) az alap nyelven túl
- Részletes grafikai brand-tervezés, logótervezés
- Marketing, SEO-kampány, tartalomírás
- Hosszú távú üzemeltetés és support (lásd 7.5)
- Jogi tartalmak (ÁSZF, adatvédelmi nyilatkozat) jogi szakértő által

---

## Összefoglalás

| Tétel | Érték |
|------|-------|
| **Becsült összes munkaóra** | 710 óra |
| **Órabér** | 18 000 Ft / óra |
| **Teljes fejlesztési költség** | **12 780 000 Ft + ÁFA** |
| **Költségsáv** | 10,8 – 15,3 M Ft |
| **Becsült átfutási idő** | ~24 hét (≈ 5,5–6 hónap) |
| **Mérföldkövek száma** | 7 |
| **Havi infrastruktúra költség** | ~30 000 Ft / hó |

---

*Ez a dokumentum tájékoztató jellegű becslés, amely a megadott követelmények alapján készült. A végleges ajánlat a részletes specifikáció és a megrendelővel folytatott egyeztetés után kerül véglegesítésre. A becslés érvényessége a kiállítástól számított 30 nap.*
