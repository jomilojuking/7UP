from math import sqrt
from scipy.stats import norm


def two_proportion_z(ca, na, cb, nb):
    pa, pb = ca / na, cb / nb
    pooled = (ca + cb) / (na + nb)
    se = sqrt(pooled * (1 - pooled) * (1 / na + 1 / nb))
    if se == 0:
        return 0.0, 1.0
    z = (pb - pa) / se
    return z, 2 * (1 - norm.cdf(abs(z)))


def verdict(acc_a, acc_b, p):
    if p >= 0.05:
        return "No statistically significant difference (p >= 0.05)"
    return f"Model {'B' if acc_b > acc_a else 'A'} is better (p = {p:.3f})"