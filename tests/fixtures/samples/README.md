# Samples

## Pokedex

https://raw.githubusercontent.com/Biuni/PokemonGO-Pokedex/master/pokedex.json

## GH Archive (JSONL, polymorphic event payloads — best JSONL stress test)

- Homepage: https://www.gharchive.org/
- Each archive contains JSON-encoded events as reported by the GitHub API. npm Files are available hourly at https://data.gharchive.org/2024-01-01-0.json.gz — just swap the date and hour (0–23). A single hour gives you ~50–200MB of highly polymorphic JSONL where payload changes shape entirely based on type.

```sh
gunzip -c 2024-01-01-0.json.gz | shuf -n 100 > sample-gharchive-100.jsonl
```

## MTGJSON (deeply nested, type-discriminated card objects)

- Homepage: https://mtgjson.com
- AllPrintings.json contains all sets with all printings and variations of cards. AllIdentifiers.json organizes cards by their unique UUID. GitHub
  Direct download: https://mtgjson.com/api/v5/AllIdentifiers.json.gz

```sh
gunzip -c AllIdentifiers.json.gz | jq '[.data | to_entries | .[0:100] | from_entries]' > sample-mtg-allidentifiers-100.json
```

## Open Food Facts (JSONL, famously sparse and inconsistent)

- Homepage: https://world.openfoodfacts.org/data
- The full JSONL file is ~7GB compressed and over 43GB decompressed. GitHub Direct download: https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz
  Note: this is huge — for testing purposes, sampling 100 records is enough to expose structural variability.

```sh
duckdb -c "
COPY (
  SELECT *
  FROM read_ndjson('openfoodfacts-products.jsonl.gz', ignore_errors = true)
  USING SAMPLE 100
) TO 'sample-openfoodfacts-products-100.jsonl' (FORMAT JSON, ARRAY false);
duckdb -c "COPY (SELECT * FROM read_ndjson('openfoodfacts-products.jsonl.gz', ignore_errors=true) USING SAMPLE 100) TO 'sample-openfoodfacts-products-100.jsonl' (FORMAT JSON, ARRAY false);
"
```

## Open Library (works/authors dump, highly variable optional fields)

- Homepage: https://openlibrary.org/developers/dumps
- Monthly dumps are available for authors, editions, and works in JSON format. Past dumps are available at https://archive.org/details/ol_exports?sort=-publicdate GitHub
  Direct download pattern: https://openlibrary.org/data/ol_dump_works_latest.txt.gz (tab-separated, each row contains a JSON object in column 5)

```sh
duckdb -c "
COPY (
  SELECT column4
  FROM read_csv('ol_dump_works_2026-01-31.txt.gz',
    delim='\t',
    header=false,
    ignore_errors=true
  )
  USING SAMPLE 100
) TO 'sample-ol-works-100.jsonl' (FORMAT CSV, HEADER false, QUOTE '');
"
```

```sh
duckdb -c "
COPY (
  SELECT column4
  FROM read_csv('ol_dump_editions_2026-01-31.txt.gz',
    delim='\t',
    header=false,
    ignore_errors=true
  )
  USING SAMPLE 100
) TO 'sample-ol-editions-100.jsonl' (FORMAT CSV, HEADER false, QUOTE '');
"
```
