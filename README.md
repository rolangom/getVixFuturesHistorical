# Get Vix Central Futures Historical

This is a node.js script uses Puppeteer to fetch and extract the csv downloaded file, read it and the insert into a Postgres table, day by day,
from http://vixcentral.com/ _Historical Prices_ tab

To instal dependencies `npm i`.

Create Postgres table:

```SQL
-- Table: public.futures_hist_prices

-- DROP TABLE public.futures_hist_prices;

CREATE TABLE IF NOT EXISTS public.futures_hist_prices
(
    fecha date NOT NULL,
    tiempo_contrato character varying(4) COLLATE pg_catalog."default" NOT NULL,
    dte integer,
    nivel double precision, -- volatility
    CONSTRAINT futures_hist_prices_pkey PRIMARY KEY (fecha, tiempo_contrato)
);
```

Set your env vars in a .env file or in the Postgres Client declaration according to https://node-postgres.com/features/connecting

```env
PGUSER=postgres
PGHOST=localhost
PGPASSWORD=
PGDATABASE=yourdb
PGPORT=5432
```

Run with date

```
node index.js "from=2011-01-15&to=2011-01-30"
```

Or run `node index.js` without parameters to fill the whole series from the begining to current day.
