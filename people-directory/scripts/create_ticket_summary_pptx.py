from pathlib import Path
import sqlite3

from pptx import Presentation
from pptx.chart.data import ChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor
from pptx.util import Inches, Pt


ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "people.db"
OUT = ROOT / "reports" / "total_tickets_created_2026-10-02.pptx"

NAVY = RGBColor(12, 28, 52)
TEAL = RGBColor(0, 174, 170)
CYAN = RGBColor(70, 205, 230)
WHITE = RGBColor(255, 255, 255)
MUTED = RGBColor(104, 119, 139)
PALE = RGBColor(239, 246, 248)
ORANGE = RGBColor(247, 164, 45)


def query(sql):
    with sqlite3.connect(DB) as con:
        con.row_factory = sqlite3.Row
        return [dict(row) for row in con.execute(sql)]


def add_title(slide, title, subtitle=None):
    box = slide.shapes.add_textbox(Inches(0.65), Inches(0.38), Inches(12), Inches(0.6))
    p = box.text_frame.paragraphs[0]
    p.text = title
    p.font.name = "Aptos Display"
    p.font.size = Pt(26)
    p.font.bold = True
    p.font.color.rgb = NAVY
    if subtitle:
        sub = slide.shapes.add_textbox(Inches(0.68), Inches(0.98), Inches(11.8), Inches(0.35))
        p = sub.text_frame.paragraphs[0]
        p.text = subtitle
        p.font.name = "Aptos"
        p.font.size = Pt(11)
        p.font.color.rgb = MUTED


def add_footer(slide):
    line = slide.shapes.add_shape(1, Inches(0.65), Inches(7.13), Inches(12), Inches(0.02))
    line.fill.solid(); line.fill.fore_color.rgb = TEAL; line.line.fill.background()
    box = slide.shapes.add_textbox(Inches(0.7), Inches(7.17), Inches(11.8), Inches(0.2))
    p = box.text_frame.paragraphs[0]
    p.text = "Evidence Ticket Agent  |  Mission Control local database  |  Snapshot: 02 Oct 2026"
    p.font.name = "Aptos"; p.font.size = Pt(8); p.font.color.rgb = MUTED


def metric_card(slide, x, y, w, h, number, label, color=TEAL):
    shape = slide.shapes.add_shape(5, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid(); shape.fill.fore_color.rgb = PALE
    shape.line.color.rgb = RGBColor(214, 229, 233)
    box = slide.shapes.add_textbox(Inches(x + .18), Inches(y + .12), Inches(w - .36), Inches(h - .2))
    tf = box.text_frame; tf.clear()
    p = tf.paragraphs[0]; p.text = str(number); p.alignment = PP_ALIGN.CENTER
    p.font.name = "Aptos Display"; p.font.size = Pt(32); p.font.bold = True; p.font.color.rgb = color
    p = tf.add_paragraph(); p.text = label; p.alignment = PP_ALIGN.CENTER
    p.font.name = "Aptos"; p.font.size = Pt(11); p.font.color.rgb = NAVY


total = query("SELECT COUNT(*) c FROM tickets")[0]["c"]
status = query("SELECT status, COUNT(*) c FROM tickets GROUP BY status ORDER BY c DESC")
types = query("SELECT ticket_type label, COUNT(*) c FROM tickets GROUP BY ticket_type ORDER BY c DESC")
evidence = query("SELECT evidence_type label, COUNT(*) c FROM tickets GROUP BY evidence_type ORDER BY c DESC")
daily = query("SELECT date(created_at) day, COUNT(*) c FROM tickets GROUP BY date(created_at) ORDER BY day")
recent = query("SELECT ticket_code,title,status,evidence_type,device,created_at FROM tickets ORDER BY id DESC LIMIT 8")

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
blank = prs.slide_layouts[6]

# Slide 1
slide = prs.slides.add_slide(blank)
bg = slide.background.fill; bg.solid(); bg.fore_color.rgb = NAVY
accent = slide.shapes.add_shape(1, Inches(0), Inches(0), Inches(.18), Inches(7.5))
accent.fill.solid(); accent.fill.fore_color.rgb = TEAL; accent.line.fill.background()
box = slide.shapes.add_textbox(Inches(.85), Inches(1.05), Inches(11.7), Inches(1.4))
p = box.text_frame.paragraphs[0]; p.text = "Total Tickets Created"
p.font.name = "Aptos Display"; p.font.size = Pt(42); p.font.bold = True; p.font.color.rgb = WHITE
p = box.text_frame.add_paragraph(); p.text = "Evidence Ticket Agent · Management snapshot"
p.font.name = "Aptos"; p.font.size = Pt(20); p.font.color.rgb = CYAN
num = slide.shapes.add_textbox(Inches(.9), Inches(3.0), Inches(4.2), Inches(2.2))
p = num.text_frame.paragraphs[0]; p.text = str(total); p.font.name = "Aptos Display"; p.font.size = Pt(86); p.font.bold = True; p.font.color.rgb = TEAL
p = num.text_frame.add_paragraph(); p.text = "tickets in the local database"; p.font.name = "Aptos"; p.font.size = Pt(18); p.font.color.rgb = WHITE
note = slide.shapes.add_textbox(Inches(.92), Inches(6.6), Inches(10), Inches(.35))
p = note.text_frame.paragraphs[0]; p.text = "Reporting date: 02 October 2026"; p.font.name = "Aptos"; p.font.size = Pt(12); p.font.color.rgb = RGBColor(184, 199, 214)

# Slide 2
slide = prs.slides.add_slide(blank)
add_title(slide, "Ticket overview", "All records currently stored in Mission Control")
open_count = next((x["c"] for x in status if x["status"] == "open"), 0)
metric_card(slide, .7, 1.55, 2.75, 1.45, total, "Total created")
metric_card(slide, 3.7, 1.55, 2.75, 1.45, open_count, "Open", ORANGE)
metric_card(slide, 6.7, 1.55, 2.75, 1.45, types[0]["c"], "Remote support")
metric_card(slide, 9.7, 1.55, 2.75, 1.45, types[-1]["c"], "Evidence tickets")

def doughnut(slide, rows, x, title):
    data = ChartData(); data.categories = [r["label"].replace("_", " ").title() for r in rows]
    data.add_series("Tickets", [r["c"] for r in rows])
    chart = slide.shapes.add_chart(XL_CHART_TYPE.DOUGHNUT, Inches(x), Inches(3.55), Inches(5.45), Inches(2.7), data).chart
    chart.has_title = True; chart.chart_title.text_frame.text = title
    chart.has_legend = True; chart.legend.position = XL_LEGEND_POSITION.RIGHT; chart.legend.include_in_layout = False
    chart.plots[0].has_data_labels = True; chart.plots[0].data_labels.show_value = True
    chart.plots[0].series[0].points[0].format.fill.solid(); chart.plots[0].series[0].points[0].format.fill.fore_color.rgb = TEAL
    if len(rows) > 1:
        chart.plots[0].series[0].points[1].format.fill.solid(); chart.plots[0].series[0].points[1].format.fill.fore_color.rgb = CYAN

doughnut(slide, types, .8, "By ticket type")
doughnut(slide, evidence, 6.95, "By evidence format")
add_footer(slide)

# Slide 3
slide = prs.slides.add_slide(blank)
add_title(slide, "Tickets created over time", "Creation volume by recorded date")
data = ChartData(); data.categories = [r["day"][5:].replace("-", "/") for r in daily]
data.add_series("Created", [r["c"] for r in daily])
chart = slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(.8), Inches(1.45), Inches(11.75), Inches(4.9), data).chart
chart.has_legend = False; chart.value_axis.minimum_scale = 0; chart.value_axis.maximum_scale = max(r["c"] for r in daily) + 2
chart.value_axis.has_major_gridlines = True; chart.category_axis.tick_labels.font.size = Pt(11)
series = chart.series[0]; series.format.fill.solid(); series.format.fill.fore_color.rgb = TEAL
series.has_data_labels = True; series.data_labels.show_value = True
add_footer(slide)

# Slide 4
slide = prs.slides.add_slide(blank)
add_title(slide, "Most recent tickets", "Latest eight records; newest first")
rows, cols = 9, 5
table = slide.shapes.add_table(rows, cols, Inches(.65), Inches(1.35), Inches(12), Inches(5.55)).table
widths = [2.15, 4.05, 1.15, 1.3, 3.35]
for i, w in enumerate(widths): table.columns[i].width = Inches(w)
headers = ["Ticket", "Title", "Status", "Evidence", "Created"]
for c, h in enumerate(headers):
    cell = table.cell(0, c); cell.text = h; cell.fill.solid(); cell.fill.fore_color.rgb = NAVY
    p = cell.text_frame.paragraphs[0]; p.font.name = "Aptos"; p.font.size = Pt(10); p.font.bold = True; p.font.color.rgb = WHITE
for r, item in enumerate(recent, start=1):
    values = [item["ticket_code"], item["title"], item["status"].title(), item["evidence_type"].title(), item["created_at"]]
    for c, value in enumerate(values):
        cell = table.cell(r, c); cell.text = str(value); cell.fill.solid(); cell.fill.fore_color.rgb = WHITE if r % 2 else PALE
        p = cell.text_frame.paragraphs[0]; p.font.name = "Aptos"; p.font.size = Pt(8.5); p.font.color.rgb = NAVY
add_footer(slide)

OUT.parent.mkdir(parents=True, exist_ok=True)
prs.save(OUT)
print(OUT)
