"""
Payment terms parser + reconciliation helpers.

The Order.payment_terms field is free-text (e.g. "50% advance D/A 60 days",
"100% advance", "D/P at sight"). This module decodes that string into a
structured shape so the workflow can:

  - block dispatch when the advance hasn't been received,
  - compute the balance-payment due date (= dispatched_at + N days),
  - fire a reminder 10 days before that due date.

Examples handled
----------------
"50% advance D/A 60 days" -> advance_pct=50, balance_days=60, balance_kind=D/A
"100% advance"             -> advance_pct=100, balance_days=0
"D/A 30 days"              -> advance_pct=0, balance_days=30, balance_kind=D/A
"D/P at sight"             -> advance_pct=0, balance_days=0, balance_kind=D/P
"30% advance D/P 45 days"  -> advance_pct=30, balance_days=45, balance_kind=D/P
"" / None                  -> advance_pct=0, balance_days=0
"""
import re


_ADV_RE = re.compile(r"(\d{1,3})\s*%\s*(?:advance|adv)\b", re.IGNORECASE)
_DAYS_RE = re.compile(r"(\d{1,4})\s*days?", re.IGNORECASE)
_KIND_RE = re.compile(r"\b(D[/\\\.]?A|D[/\\\.]?P|TT|LC|CIA)\b", re.IGNORECASE)


def parse_payment_terms(raw):
    """Parse a free-text payment_terms string into a dict.

    Returns:
        {
            'raw': original string,
            'advance_pct': int (0-100),
            'balance_pct': int (0-100),
            'balance_days': int (0 if "at sight" / not specified),
            'balance_kind': 'D/A' | 'D/P' | 'TT' | 'LC' | 'CIA' | '',
            'has_advance': bool,
            'has_balance': bool,
        }
    """
    s = (raw or "").strip()
    if not s:
        return {
            'raw': '',
            'advance_pct': 0,
            'balance_pct': 0,
            'balance_days': 0,
            'balance_kind': '',
            'has_advance': False,
            'has_balance': False,
        }

    advance_pct = 0
    m = _ADV_RE.search(s)
    if m:
        try:
            advance_pct = max(0, min(100, int(m.group(1))))
        except ValueError:
            advance_pct = 0

    balance_kind = ''
    m = _KIND_RE.search(s)
    if m:
        token = m.group(1).upper().replace('\\', '/').replace('.', '/')
        # Normalize "DA" -> "D/A", "DP" -> "D/P"
        if token in ('DA', 'D/A'):
            balance_kind = 'D/A'
        elif token in ('DP', 'D/P'):
            balance_kind = 'D/P'
        else:
            balance_kind = token

    balance_days = 0
    if 'at sight' not in s.lower():
        m = _DAYS_RE.search(s)
        if m:
            try:
                balance_days = max(0, int(m.group(1)))
            except ValueError:
                balance_days = 0

    balance_pct = max(0, 100 - advance_pct)
    has_advance = advance_pct > 0
    has_balance = balance_pct > 0 or balance_kind in ('D/A', 'D/P', 'LC', 'TT')

    return {
        'raw': s,
        'advance_pct': advance_pct,
        'balance_pct': balance_pct,
        'balance_days': balance_days,
        'balance_kind': balance_kind,
        'has_advance': has_advance,
        'has_balance': has_balance,
    }


def _due_date_with_days(order, days):
    if not order.dispatched_at or not days:
        return None
    from datetime import timedelta
    return (order.dispatched_at + timedelta(days=days)).date()


def compute_balance_due_date(order):
    """Balance due = dispatched_at + balance_days, but only when the
    Balance row is actually scheduled After Dispatch."""
    if order.balance_is_before_dispatch:
        return None
    parsed = parse_payment_terms(order.payment_terms)
    if not parsed['has_balance']:
        return None
    if parsed['balance_days'] == 0 and parsed['balance_kind'] in ('', 'TT'):
        return None
    return _due_date_with_days(order, parsed['balance_days'])


def compute_advance_due_date(order):
    """Due date for the Advance row when the executive has flipped it to
    After Dispatch. The terms string carries no separate "advance_days"
    field, so we reuse the parsed `balance_days` (typical case: terms like
    "D/A 60 days" with the user marking the only payment as advance).
    Falls back to 30 days as a sensible default."""
    if order.advance_is_before_dispatch:
        return None
    parsed = parse_payment_terms(order.payment_terms)
    if not parsed['has_advance']:
        return None
    days = parsed['balance_days'] or 30
    return _due_date_with_days(order, days)


def advance_outstanding(order):
    """Advance is required but not received yet."""
    parsed = parse_payment_terms(order.payment_terms)
    return parsed['has_advance'] and not order.advance_payment_received_at


def balance_outstanding(order):
    """Balance is expected but not yet received."""
    parsed = parse_payment_terms(order.payment_terms)
    return parsed['has_balance'] and not order.balance_payment_received_at


def before_dispatch_outstanding(order):
    """True if any payment the user has categorized as "Before Dispatch"
    is still unpaid. This is what gates the Dispatched transition.

    The parser determines whether each row exists at all (advance / balance);
    the executive's per-row toggle (`advance_is_before_dispatch`,
    `balance_is_before_dispatch`) decides whether each row blocks dispatch.
    """
    parsed = parse_payment_terms(order.payment_terms)
    if parsed['has_advance'] and order.advance_is_before_dispatch and not order.advance_payment_received_at:
        return True
    if parsed['has_balance'] and order.balance_is_before_dispatch and not order.balance_payment_received_at:
        return True
    return False
