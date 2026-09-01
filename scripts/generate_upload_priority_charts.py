"""Generate NR-priority charts for PCNs pending Delta upload."""

from pathlib import Path
import sqlite3

import matplotlib.pyplot as plt


ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / 'data' / 'pcn.db'
OUT = ROOT / 'docs'
FROM_MONTH = '2025-08'
TO_MONTH = '2026-08'


def load_queue(connection, risk):
    if risk == 'MINOR':
        states = ('MINOR_READY_UPLOAD',)
    else:
        states = ('MAJOR_READY_UPLOAD', 'MAJOR_BLOCKED_RA')

    placeholders = ','.join('?' for _ in states)
    query = f'''
        SELECT p.id, p.pcn_number_base,
               COALESCE(SUM(m.net_revenue), 0) AS net_revenue
        FROM pcn p
        JOIN pcn_executive_status e ON e.pcn_id = p.id
        JOIN pcn_ti_part pt ON pt.pcn_id = p.id
        LEFT JOIN material_month_revenue m
          ON m.normalized_part_number = (
               SELECT normalized_part_number FROM ti_part WHERE id = pt.ti_part_id
             )
         AND m.revenue_month BETWEEN ? AND ?
        WHERE e.executive_state IN ({placeholders})
        GROUP BY p.id, p.pcn_number_base
        ORDER BY net_revenue DESC, p.pcn_number_base
    '''
    return connection.execute(query, (FROM_MONTH, TO_MONTH, *states)).fetchall()


def make_chart(rows, risk):
    values = [max(float(row['net_revenue']), 0) for row in rows]
    total = sum(values)
    cumulative = []
    running = 0
    for value in values:
        running += value
        cumulative.append(running / total * 100 if total else 0)

    sold = sum(value > 0 for value in values)
    top_n = min(25, len(values))
    top_share = cumulative[top_n - 1] if top_n else 0

    fig, ax = plt.subplots(figsize=(11, 5.8))
    x = range(1, len(values) + 1)
    ax.bar(x, values, color='#2f6f9f', width=1.0, label='PCN net revenue')
    ax2 = ax.twinx()
    ax2.plot(x, cumulative, color='#d95f02', linewidth=2.5, label='Cumulative NR share')
    ax2.axhline(80, color='#d95f02', linestyle='--', linewidth=1)
    ax2.axvline(top_n, color='#555555', linestyle=':', linewidth=1)
    ax2.annotate(f'Top {top_n}: {top_share:.1f}% of total NR',
                 xy=(top_n, top_share), xytext=(top_n + 8, min(top_share + 5, 96)),
                 arrowprops={'arrowstyle': '->', 'color': '#555555'}, fontsize=10)
    ax.set_title(f'{risk} PCNs pending Delta upload: prioritize by last-year NR')
    ax.set_xlabel(f'PCNs ranked by NR (highest first) — {sold} of {len(values)} have NR > 0')
    ax.set_ylabel('PCN net revenue')
    ax2.set_ylabel('Cumulative share of total NR (%)')
    ax2.set_ylim(0, 105)
    ax.set_xlim(0, len(values) + 1)
    ax.grid(axis='y', alpha=0.2)
    lines, labels = ax.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    ax.legend(lines + lines2, labels + labels2, loc='lower right')
    fig.text(0.01, 0.01, f'Revenue window: {FROM_MONTH} to {TO_MONTH} (inclusive) | Total NR: {total:,.0f}', fontsize=9)
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    path = OUT / f'{risk.lower()}-upload-priority.png'
    fig.savefig(path, dpi=180)
    plt.close(fig)
    print(f'{risk}: {len(values)} PCNs; {sold} with NR; top {top_n} = {top_share:.2f}% of total NR; total={total:.2f}; {path}')


with sqlite3.connect(DB) as connection:
    connection.row_factory = sqlite3.Row
    for queue_risk in ('MINOR', 'MAJOR'):
        make_chart(load_queue(connection, queue_risk), queue_risk)
