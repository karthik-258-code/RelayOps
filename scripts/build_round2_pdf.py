from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, KeepTogether

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs' / 'round-2-submission.md'
TARGET = ROOT / 'output' / 'pdf' / 'RelayOps_Round_2_Project_Report.pdf'
TARGET.parent.mkdir(parents=True, exist_ok=True)

ink = colors.HexColor('#17251f')
muted = colors.HexColor('#5e6c63')
accent = colors.HexColor('#1b7158')
pale = colors.HexColor('#edf4ef')
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='ReportTitle', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=25, leading=30, textColor=ink, alignment=TA_LEFT, spaceAfter=8))
styles.add(ParagraphStyle(name='Deck', parent=styles['Normal'], fontName='Helvetica', fontSize=11, leading=16, textColor=muted, spaceAfter=16))
styles.add(ParagraphStyle(name='Section', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=15.5, leading=18, textColor=accent, spaceBefore=9, spaceAfter=5, keepWithNext=True))
styles.add(ParagraphStyle(name='Subsection', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=11, leading=15, textColor=ink, spaceBefore=8, spaceAfter=4, keepWithNext=True))
styles.add(ParagraphStyle(name='BodyReport', parent=styles['BodyText'], fontName='Helvetica', fontSize=9.2, leading=13, textColor=ink, spaceAfter=4))
styles.add(ParagraphStyle(name='BulletReport', parent=styles['BodyText'], fontName='Helvetica', fontSize=8.9, leading=10.9, textColor=ink, leftIndent=13, firstLineIndent=-8, spaceAfter=1.2))
styles.add(ParagraphStyle(name='MonoReport', parent=styles['BodyText'], fontName='Courier', fontSize=8, leading=11, textColor=ink, backColor=pale, borderPadding=7, leftIndent=8, rightIndent=8, spaceBefore=4, spaceAfter=8))

def inline(text):
    text = escape(text)
    import re
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'`(.+?)`', r'<font name="Courier">\1</font>', text)
    text = re.sub(r'<(https?://[^ ]+)>', r'<link href="\1" color="#1b7158">\1</link>', text)
    return text

def page_chrome(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(colors.HexColor('#d9e2dc'))
    canvas.line(20*mm, 16*mm, width-20*mm, 16*mm)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(muted)
    canvas.drawString(20*mm, 10.5*mm, 'RELAYOPS  /  ROUND 2 BUILD REPORT')
    canvas.drawRightString(width-20*mm, 10.5*mm, f'{doc.page}')
    canvas.restoreState()

story = []
lines = SOURCE.read_text(encoding='utf-8-sig').splitlines()
for line in lines:
    line = line.strip()
    if not line or line == '```':
        continue
    if line == '<!-- page-break -->':
        story.append(PageBreak())
        continue
    if line.startswith('# '):
        story.append(Paragraph(inline(line[2:]), styles['ReportTitle']))
        story.append(Paragraph('Evidence-backed employee handover  ·  Local Round 2 implementation', styles['Deck']))
    elif line.startswith('## '):
        story.append(Paragraph(inline(line[3:]), styles['Section']))
    elif line.startswith('- '):
        story.append(Paragraph('•  ' + inline(line[2:]), styles['BulletReport']))
    elif line[:1].isdigit() and '. ' in line[:4]:
        story.append(Paragraph(inline(line), styles['BulletReport']))
    elif line.startswith('  ->') or line.startswith('->'):
        story.append(Paragraph(inline(line.replace('->', '→')), styles['MonoReport']))
    elif line.startswith('```'):
        continue
    else:
        story.append(Paragraph(inline(line), styles['BodyReport']))

doc = SimpleDocTemplate(str(TARGET), pagesize=A4, rightMargin=20*mm, leftMargin=20*mm, topMargin=18*mm, bottomMargin=23*mm, title='RelayOps — Round 2 Build Report', author='RelayOps team')
doc.build(story, onFirstPage=page_chrome, onLaterPages=page_chrome)
print(f'Created {TARGET}')
