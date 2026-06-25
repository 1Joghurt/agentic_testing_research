# Hypothesenfixierung

## Forschungsfragen

- *RQ1:* Wie unterscheiden sich KI-gestützte Testskriptgenerierung und agentenbasiertes Testen im Web-Frontend-Testing hinsichtlich zentraler Testqualitätsattribute?
- *RQ2:* Welchen Einfluss hat die Bereitstellung einer expliziten funktionalen Beschreibung der Zielanwendung im Vergleich zur autonomen Exploration auf die Leistungsfähigkeit der untersuchten KI-Testansätze?
- *RQ3:* Welche Implikationen ergeben sich aus den empirischen Ergebnissen für die praktische Nutzung KI-basierter Testverfahren in unterschiedlichen Anwendungskontexten?

## 2×2-Untersuchungsdesign

| **Testansatz**                            | **Funktionale Beschreibung**                                             | **Autonome Exploration**                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **KI-gestützte<br>Testskriptgenerierung** | KI-gestützte Testskript-<br>generierung mit funktionaler<br>Beschreibung | KI-gestützte Testskript-<br>generierung auf Basis<br>autonomer Exploration |
| **Agentenbasiertes<br>Testen**            | Agentenbasiertes Testen mit<br>funktionaler Beschreibung                 | Agentenbasiertes Testen auf<br>Basis autonomer Exploration                 |

## Defekteinspielung und Wiederholungsstrategie

- Pro Variante des Untersuchungsdesign _5 Wiederholungen_
- Ablauf: 
   - _Skript-Paradigma:_ Skript auf Originalversion erzeugen, dann gegen Modifikationen ausführen
   - _Agenten-Paradigma:_ direkte Ausführung auf modifizierter Version
- Einspielung:
   - _Defekte:_ alle funktionale und visuelle Defekte gemeinsam je Testobjekt eingespielt
   - _Strukturänderungen:_ jeweils einzeln eingesteuert, um Fragilität/Laufabbrüche zuordnen zu können

## Forschungsmethodik pro Forschungsfrage

- *RQ1:* Konfirmatorisch
- *RQ2:* Konfirmatorisch
- *RQ3:* Explorativ

## Testobjekte

- RealWorld Conduit:
  - Angular-basiertes Frontend: <https://github.com/realworld-apps/angular-realworld-example-app>
  - Python-/Django-basiertes Backend: <https://github.com/c4ffein/realworld-django-ninja>
- Selbst entwickelte Anwendung (WorkshopHub): React/Next.js.

## Struktur der Modifikationen

| **Kategorie**                | **Anzahl** | **Beschreibung**                                    |
| ---------------------------- | ---------- | --------------------------------------------------- |
| **Funktionale Defekte**      | 5          | Fehlerhafte Anwendungslogik                         |
| **Visuelle Defekte**         | 5          | Fehlerhafte Änderungen am sichtbaren Verhalten      |
| **Strukturelle  Änderungen** | 3          | Änderungen an DOM-Struktur ohne fachliche Bedeutung |
        

## Hypothesen

**RQ1 - Paradigmenvergleich:**

- *H1.1 (Effektivität):* Die Effektivität unterscheidet sich zwischen KI-gestützter Testskriptgenerierung und agentenbasiertem Testen.
- *H1.2 (Abdeckung):* Agentenbasiertes Testen erzielt eine höhere Abdeckung als KI-gestützte Testskriptgenerierung.
- *H1.3 (Stabilität):* KI-gestützte Testskriptgenerierung erzielt eine höhere Stabilität als agentenbasiertes Testen.
- *H1.4 (Reproduzierbarkeit):* KI-gestützte Testskriptgenerierung erzielt über wiederholte Läufe eine höhere Reproduzierbarkeit als agentenbasiertes Testen.
- *H1.5 (Zuverlässigkeit):* Die Zuverlässigkeit unterscheidet sich zwischen KI-gestützter Testskriptgenerierung und agentenbasiertem Testen.
- *H1.6a (Effizienz, Initialaufwand):* Der initiale technische Aufwand und die Laufzeit zur Bereitstellung eines einsatzbereiten Testartefakts fällt bei KI-gestützter Testskriptgenerierung höher aus als bei agentenbasiertem Testen.
- *H1.6b (Effizienz, Aufwand zur Laufzeit):* Der technische Aufwand und die Laufzeit pro Testlauf fallen bei agentenbasiertem Testen höher aus als bei KI-gestützter Testskriptgenerierung.

**RQ2 - Einfluss expliziter Kontextinformation:**

- *H2.1 (Effektivität):* Die Effektivität unterscheidet sich zwischen Läufen mit und ohne funktionale Beschreibung der Zielanwendung.
- *H2.2 (Abdeckung):* Läufe mit funktionaler Beschreibung erzielen eine geringere Abdeckung als Läufe ohne funktionale Beschreibung.
- *H2.3 (Zuverlässigkeit):* Läufe mit funktionaler Beschreibung erzielen eine höhere Zuverlässigkeit als Läufe ohne funktionale Beschreibung.
- *H2.4 (Effizienz):* Der technische Aufwand unterscheidet sich zwischen Läufen mit und ohne funktionale Beschreibung.

## Operationalisierung der Qualitätsattribute

- *Effektivität*
  - Fehlerentdeckungsrate
- *Abdeckung*
  - Funktionale Abdeckung
  - Relative UI-Element-Abdeckung
- *Stabilität*
  - Flakiness
  - Fragilität
- *Reproduzierbarkeit*
  - Ergebniskonsistenz
  - Trajektorienkonsistenz
- *Zuverlässigkeit*
  - False-Positive-Rate
  - False-Negative-Rate
- *Effizienz*
  - Tokenverbrauch
  - Laufzeit des Agenten-Loops
  - Laufzeit der Skriptausführung

## Auswertungsverfahren

**Konfirmatorische Auswertung der Hypothesen**

Die konfirmatorische Auswertung erfolgt vollständig deskriptiv auf Grundlage der operationalisierten Qualitätsattribute.

Die Hypothesen werden wie folgt geprüft:

- _Hypothesen zu RQ1:_ Geprüft über paarweise Vergleiche der relevanten Metriken zwischen den Paradigmen, über den Mittelwert der Ergebnisse der Wissenskonfigurationen aggregiert.
- _Hypothesen zu RQ2:_ Geprüft über paarweise Vergleiche der relevanten Metriken zwischen den Wissenskonfigurationen, über den Mittelwert der Ergebnisse der Paradigmen aggregiert.

Weitere Definitionen:

- Gerichtete Hypothese gestützt, wenn hinreichende Differenz in der erwarteten Richtung bei mindestens 2/3 aller erfassten Teilmetriken über die Testobjekte vorliegt.
- Zweiseitigen Hypothesen gestützt, wenn hinreichende Differenz in derselben Richtung bei mindestens 2/3 aller erfassten Teilmetriken über die Testobjekte vorliegt.
- Differenz hinreichend falls: > 10 % bzw. > |0,1| bei der relativen UI-Element-Abdeckung.

**Explorative Analyse**

- Ergänzende explorative Analyse zur Erklärung quantitativer Befunde und zur Beantwortung von RQ3.
- Ergebnisoffene Untersuchung nach EDA-Prinzipien durch Aggregation, Betrachtung einzelner Läufe und Visualisierungen.
- Aggregation über alle Testobjekte hinweg, um übergreifende Stärken, Schwächen und Einsatzgrenzen der Paradigmen abzuleiten.
- Nutzung von Netzdiagrammen und Streudiagrammen zur Darstellung von Verteilungen, Streuungen und Ausreißern.
- Zusätzliche Auffälligkeiten werden als Ansatzpunkte für künftige Arbeiten dokumentiert.