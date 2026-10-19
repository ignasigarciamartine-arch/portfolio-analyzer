"""Cross-check: browser engine (projected gradient descent) vs SciPy SLSQP on the same data and objectives.
    python data/build_data.py && python validation/check_scipy.py
"""
import json, subprocess
from pathlib import Path
import numpy as np
from scipy.optimize import minimize

HERE = Path(__file__).resolve().parent
D = json.loads((HERE.parent / "web" / "dades-cartera.json").read_text(encoding="utf-8"))
JS = json.loads(subprocess.run(["node", str(HERE / "engine_weights.js")], capture_output=True, text=True, check=True).stdout)
n0 = len(D["dates"])


def returns(ids, start):
    first = max(n0 - len(D["actius"][i]["p"]) for i in ids)
    a = first
    while start and D["dates"][a] < start:
        a += 1
    P = np.array([[D["actius"][i]["p"][k - (n0 - len(D["actius"][i]["p"]))] for i in ids] for k in range(a, n0)])
    return P[1:] / P[:-1] - 1


def slsqp(f, n, lo, hi, seed=1):
    rs, best = np.random.default_rng(seed), None
    cons = [{"type": "eq", "fun": lambda w: w.sum() - 1}]
    for _ in range(12):
        w0 = np.clip(rs.dirichlet(np.ones(n)), lo, hi); w0 /= w0.sum()
        r = minimize(f, w0, method="SLSQP", bounds=[(lo, hi)] * n, constraints=cons, options={"maxiter": 3000, "ftol": 1e-14})
        if best is None or r.fun < best.fun:
            best = r
    return best.x


worst = 0.0
for case in JS:
    R = returns(case["ids"], case["from"]); m, C = R.mean(0), np.cov(R.T); n = len(case["ids"])
    rfd = (1 + case["rf"]) ** (1 / 252) - 1

    def sortino(w):
        rp = R @ w; d = np.minimum(rp - rfd, 0)
        return -(rp.mean() - rfd) / np.sqrt((d ** 2).mean())

    py = {
        "minVar": slsqp(lambda w: w @ C @ w * 1e4, n, case["lo"], case["hi"]),
        "maxSharpe": slsqp(lambda w: -(w @ m - rfd) / np.sqrt(w @ C @ w), n, case["lo"], case["hi"]),
        "maxSortino": slsqp(sortino, n, case["lo"], case["hi"]),
    }
    print(f"\n{case['name']}  ({case['T']} days, engine {case['ms']} ms)")
    for k, w in py.items():
        dif = np.abs(w - np.array(case["w"][k])).max(); worst = max(worst, dif)
        print(f"  {k:11s} max |weight difference| = {dif:.4f}")
print(f"\nWorst difference across all cases: {worst:.4f}")
