"""Dades de l'analitzador de cartera (/cartera/): preus diaris d'ETFs públics (yfinance), passats a euros.
    python data/build_data.py  ->  web/dades-cartera.json
Només fonts públiques (res de Refinitiv: no es pot redistribuir)."""
import json, sys
from pathlib import Path
import pandas as pd, yfinance as yf

OUT = Path(__file__).resolve().parent.parent / "web" / "dades-cartera.json"
# id, nom a la web, grup, ticker yfinance
ACTIUS = [
    ("SP500", "S&P 500", "Borsa", "SPY"),
    ("NASDAQ", "Nasdaq 100", "Borsa", "QQQ"),
    ("MON", "Borsa mundial", "Borsa", "ACWI"),
    ("EUROPA", "Borsa europea", "Borsa", "VGK"),
    ("JAPO", "Borsa japonesa", "Borsa", "EWJ"),
    ("EMERG", "Emergents", "Borsa", "EEM"),
    ("SMALL", "Empreses petites EUA", "Borsa", "IWM"),
    ("REITS", "Immobiliari (REITs)", "Borsa", "VNQ"),
    ("BO_7_10", "Bons EUA 7-10 anys", "Renda fixa", "IEF"),
    ("BO_20", "Bons EUA 20+ anys", "Renda fixa", "TLT"),
    ("TIPS", "Bons lligats a la inflació", "Renda fixa", "TIP"),
    ("BO_CORP", "Bons corporatius", "Renda fixa", "LQD"),
    ("BO_GLOBAL", "Bons globals", "Renda fixa", "IGOV"),
    ("OR", "Or", "Alternatius", "GLD"),
    ("PLATA", "Plata", "Alternatius", "SLV"),
    ("MATERIES", "Matèries primeres", "Alternatius", "DBC"),
    ("BTC", "Bitcoin", "Alternatius", "BTC-USD"),
]
tick = [a[3] for a in ACTIUS] + ["EURUSD=X"]
brut = yf.download(tick, start="2006-01-01", auto_adjust=True, progress=False, group_by="column")["Close"]
if brut.index.tz is not None:
    brut.index = brut.index.tz_localize(None)
eurusd = brut["EURUSD=X"].ffill()
# dies hàbils de borsa EUA (el bitcoin cotitza cada dia: ens quedem amb els dies de SPY)
dies = brut["SPY"].dropna().index
px = brut.loc[dies, [a[3] for a in ACTIUS]].div(eurusd.reindex(dies).ffill(), axis=0)
px = px[px.index >= "2007-01-01"]
series = {}
for id_, nom, grup, t in ACTIUS:
    s = px[t]
    inici = s.first_valid_index()
    s = s.loc[inici:].ffill()
    if s.isna().any() or len(s) < 750:
        sys.exit(f"[ERROR] {t}: dades incompletes")
    series[id_] = {"nom": nom, "grup": grup, "ticker": t, "inici": inici.strftime("%Y-%m-%d"),
                   "p": [round(float(v), 4) for v in s.values]}
dates = [d.strftime("%Y-%m-%d") for d in px.index]
out = {"actualitzat": dates[-1], "moneda": "EUR", "dates": dates, "actius": series}
OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(OUT, f"{OUT.stat().st_size/1024:.0f} KB", len(dates), "dies", dates[0], "->", dates[-1])
for k, v in series.items():
    print(f"  {k:10s} {v['ticker']:8s} des de {v['inici']}  {len(v['p'])} dies")
