"""
Packing Instructions Form (PIF) service — auto-fill from order/order_item + PDF generation.
Matches the Kriya Biosys PIF template layout shown in reference image.
"""
import io
import os
import logging
from datetime import date
from django.conf import settings

logger = logging.getLogger(__name__)


def _next_pif_number(order):
    """PIF-<order#>-<seq> where seq is 1-based across the order's PIFs."""
    from finance.models import PackingInstructionForm
    count = PackingInstructionForm.objects.filter(order=order).count() + 1
    order_no = (order.order_number or '').replace('ORD-', '')
    return f'PIF-{order_no}-{count}'


def create_pif_from_order_item(order_item, user):
    """Create a PIF draft from an OrderItem, pre-filling reasonable defaults."""
    from finance.models import PackingInstructionForm

    order = order_item.order
    client = order.client

    pif = PackingInstructionForm.objects.create(
        pif_number=_next_pif_number(order),
        order=order,
        order_item=order_item,
        client=client,
        po_no=order.po_number or '',
        pif_date=date.today(),
        product_name=order_item.product_name or '',
        product_description=order_item.client_product_name or '',
        packing_description='',
        quantity=f'{order_item.quantity} {order_item.unit}'.strip(),
        notes='Kindly follow the packing instructions as mentioned in the form. '
              'Please let us know for any clarification and also do let us know '
              'if any other packing materials are required.',
        container_left={
            'type': '',
            'bottle_colour': '',
            'cap_colour': '',
            'cap_type': '',
            'measuring_cups': '',
        },
        container_right={
            'colour': '',
            'box_thickness': '',
            'carton_box_label': '',
            'batch_sticker': '',
            'batch_no': '',
        },
        packing_sections=[
            {'label': '100 ml', 'quantity_left': {}, 'accessories_right': {}},
            {'label': '500 ml', 'quantity_left': {}, 'accessories_right': {}},
            {'label': '1 Litre', 'quantity_left': {}, 'accessories_right': {}},
        ],
        footer_note=('Please check the below details and follow the instructions '
                     'as given above packing list and materials needs to be checked '
                     'and approved by Purchase Department, Inspection Team and Factory Incharge.'),
        created_by=user,
    )
    return pif


# ── PDF Generation ──
_LEFT_FIELDS_CONTAINER = [
    ('type', 'Type'),
    ('bottle_colour', 'Bottle Colour'),
    ('cap_colour', 'Cap Colour'),
    ('cap_type', 'Cap Type'),
    ('measuring_cups', 'Measuring Cups'),
]
_RIGHT_FIELDS_CONTAINER = [
    ('colour', 'Colour'),
    ('box_thickness', 'Box Thickness'),
    ('carton_box_label', 'Carton Box Label/Design'),
    ('batch_sticker', 'Batch Sticker'),
    ('batch_no', 'Batch No.'),
]
_LEFT_FIELDS_QTY = [
    ('total_quantity', 'Total Quantity'),
    ('bottles_caps', 'No. of Bottles/Caps'),
    ('liters_per_box', 'No. of Liters per Box'),
    ('carton_boxes', 'No. of Carton Box'),
]
_RIGHT_FIELDS_ACC = [
    ('label_quantity', 'Label/Quantity'),
    ('label_type', 'Label Type'),
    ('label_size', 'Label Size'),
    ('leaflet_quantity', 'Leaflet/Quantity'),
    ('sleeves_quantity', 'Sleeves/Quantity'),
    ('partitions', 'Partitions'),
    ('pads', 'Pads'),
    ('box_thickness', 'Box Thickness'),
]


def generate_pif_pdf(pif):
    """Generate a PDF for the given PIF, matching the Kriya Biosys template."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        BaseDocTemplate, PageTemplate, Frame, FrameBreak,
        Table, TableStyle, Paragraph, Spacer, Image, KeepInFrame,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    buffer = io.BytesIO()
    pdf_title = f'PIF {pif.pif_number} - {pif.product_name or ""}'
    # Page margins — equal breathing room on all four sides so the
    # document doesn't touch any edge. The green band sits INSIDE the
    # left/right margins and starts ~TOP_GAP below the top edge.
    TOP_GAP = 10 * mm   # whitespace from page top to the green band
    BOT_M = 10 * mm     # whitespace from page bottom to the footer block
    LR_M = 12 * mm      # whitespace on left and right
    GREEN_BAND_H = 4 * mm
    # Two-frame layout: a tall content frame at the top + a short footer
    # frame anchored to the bottom of the page. Footer always sits at the
    # page bottom regardless of how much content lives above it.
    page_w, page_h = A4
    content_w = page_w - 2 * LR_M
    FOOTER_H = 32 * mm  # reserved bottom strip for note + 3 signatures (give it
                       # enough room so the seal/sign + label rows never spill)
    GAP_AFTER_BAND = 3 * mm  # tiny breath between green band and header
    content_x = LR_M
    content_y = BOT_M + FOOTER_H
    content_h = page_h - TOP_GAP - GREEN_BAND_H - GAP_AFTER_BAND - BOT_M - FOOTER_H
    footer_y = BOT_M
    content_frame = Frame(
        content_x, content_y, content_w, content_h,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        id='content', showBoundary=0,
    )
    footer_frame = Frame(
        content_x, footer_y, content_w, FOOTER_H,
        leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        id='footer', showBoundary=0,
    )

    def _draw_green_band(canvas, _doc):
        """Kriya-green band sitting inside the page margins (does not run
        edge-to-edge — there's whitespace on all four sides)."""
        canvas.saveState()
        canvas.setFillColor(colors.HexColor('#4e8a2d'))
        band_y = page_h - TOP_GAP - GREEN_BAND_H
        band_w = page_w - 2 * LR_M
        canvas.rect(LR_M, band_y, band_w, GREEN_BAND_H, stroke=0, fill=1)
        canvas.restoreState()

    doc = BaseDocTemplate(
        buffer, pagesize=A4,
        leftMargin=LR_M, rightMargin=LR_M,
        topMargin=TOP_GAP + GREEN_BAND_H + GAP_AFTER_BAND,
        bottomMargin=BOT_M,
        title=pdf_title, author='Kriya Biosys Private Limited',
    )
    doc.addPageTemplates([PageTemplate(
        id='pif', frames=[content_frame, footer_frame], onPage=_draw_green_band,
    )])

    styles = getSampleStyleSheet()
    G = colors.HexColor('#4e8a2d')      # Kriya green
    BLUE = colors.HexColor('#1f4e79')   # section heading blue
    GREY = colors.HexColor('#dedede')
    BLACK = colors.black

    img_dir = os.path.join(settings.BASE_DIR, 'static', 'images')
    logo_path = os.path.join(img_dir, 'logo.png')
    seal_path = os.path.join(img_dir, 'seal.png')
    sign_path = os.path.join(img_dir, 'sign.png')

    # Fonts
    _bf, _br = 'Helvetica-Bold', 'Helvetica'
    try:
        bos_bold = os.path.join(img_dir, 'BookmanOldStyle-Bold.ttf')
        bos_reg = os.path.join(img_dir, 'BookmanOldStyle-Regular.ttf')
        if os.path.exists(bos_bold):
            pdfmetrics.registerFont(TTFont('BookmanOldStyle-Bold', bos_bold))
            _bf = 'BookmanOldStyle-Bold'
        if os.path.exists(bos_reg):
            pdfmetrics.registerFont(TTFont('BookmanOldStyle', bos_reg))
            _br = 'BookmanOldStyle'
    except Exception:
        pass

    # Tighter typography to match the compact feel of the original template.
    s8 = ParagraphStyle('s8', parent=styles['Normal'], fontSize=7, leading=8.5, fontName=_br)
    s8b = ParagraphStyle('s8b', parent=styles['Normal'], fontSize=7, leading=8.5, fontName=_bf)
    s7 = ParagraphStyle('s7', parent=styles['Normal'], fontSize=6.2, leading=7.5, fontName=_br)
    s_title = ParagraphStyle('s_title', parent=styles['Normal'], fontSize=12, leading=14, fontName=_bf, alignment=1)
    s_sec = ParagraphStyle('s_sec', parent=styles['Normal'], fontSize=8, leading=9.5, fontName=_bf, textColor=BLUE)

    PW = 190 * mm  # page content width

    el = []

    # ── Header: logo | title | meta ── (logo trimmed to match original)
    logo = Image(logo_path, width=22 * mm, height=13 * mm) if os.path.exists(logo_path) else Paragraph('', s8)
    left_cell = Table([[logo]], colWidths=[50 * mm])
    left_cell.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))

    title_p = Paragraph('Packing Instructions Form', s_title)

    pif_date_str = pif.pif_date.strftime('%d/%m/%Y') if pif.pif_date else ''
    meta_tbl = Table([
        [Paragraph(f'<b>PO No</b> : {pif.po_no or "-"}', s8)],
        [Paragraph(f'<b>PI Form No</b> : {pif.pif_number}', s8)],
        [Paragraph(f'<b>Date</b> : {pif_date_str}', s8)],
    ], colWidths=[50 * mm])
    meta_tbl.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))

    header = Table([[left_cell, title_p, meta_tbl]], colWidths=[50 * mm, PW - 100 * mm, 50 * mm])
    header.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('VALIGN', (1, 0), (1, 0), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    el.append(header)
    el.append(Spacer(1, 1 * mm))
    el.append(Table([['']], colWidths=[PW], rowHeights=[0.5],
                    style=TableStyle([('LINEBELOW', (0, 0), (-1, -1), 0.5, BLACK)])))
    el.append(Spacer(1, 1 * mm))

    # Helper for spacers that the leftover-distribution pass is allowed to
    # grow. Header-related spacers (above and below the divider line) are
    # NOT marked, so the title block stays glued to the divider.
    def flex_spacer(h):
        s = Spacer(1, h)
        s._pif_flex = True
        return s

    # ── Helper to render a 2-col heading row and a 2-col key/value block ──
    def section_heading_row(left_text, right_text=None):
        left_para = Paragraph(left_text, s_sec)
        right_para = Paragraph(right_text, s_sec) if right_text else ''
        t = Table([[left_para, right_para]], colWidths=[PW / 2, PW / 2])
        t.setStyle(TableStyle([
            ('LINEBELOW', (0, 0), (-1, -1), 0.3, BLUE),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            # Full one-row gap between the blue underline and the first
            # detail row — matches the empty Excel row in the original.
            # 9pt matches the height of one data row (~7pt font + ~1pt top
            # padding + ~1pt bottom padding).
            ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
            ('TOPPADDING', (0, 0), (-1, -1), 0.5),
        ]))
        return t

    def kv_pair(label, value):
        return [Paragraph(label, s8), Paragraph(str(value or ''), s8)]

    def kv_block(fields, source):
        rows = [kv_pair(label, source.get(key, '')) for key, label in fields]
        t = Table(rows, colWidths=[33 * mm, (PW / 2) - 33 * mm])
        t.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
            # Uniform top/bottom padding gives each row an excel-cell feel.
            ('TOPPADDING', (0, 0), (-1, -1), 1),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ]))
        return t

    def two_col(left, right):
        t = Table([[left, right]], colWidths=[PW / 2, PW / 2])
        t.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        return t

    # ── Product Details / Notes ──
    el.append(section_heading_row('Product Details', 'Notes'))
    product_rows = [
        kv_pair('Product Name', pif.product_name),
        kv_pair('Product Description', pif.product_description),
        kv_pair('Packing Description', pif.packing_description),
        kv_pair('Quantity', pif.quantity),
    ]
    product_tbl = Table(product_rows, colWidths=[40 * mm, (PW / 2) - 40 * mm])
    product_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))
    notes_box = Table([[Paragraph(pif.notes or '', s8)]], colWidths=[(PW / 2) - 4 * mm], rowHeights=[18 * mm])
    notes_box.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.3, GREY),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
    ]))
    notes_wrap = Table([[notes_box]], colWidths=[PW / 2])
    notes_wrap.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 2 * mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
    ]))
    el.append(two_col(product_tbl, notes_wrap))
    el.append(flex_spacer(1 * mm))

    # ── Container / Carton Box ──
    el.append(section_heading_row('Container', 'Carton Box'))
    el.append(two_col(
        kv_block(_LEFT_FIELDS_CONTAINER, pif.container_left or {}),
        kv_block(_RIGHT_FIELDS_CONTAINER, pif.container_right or {}),
    ))
    el.append(flex_spacer(1 * mm))

    # ── Repeating Packing Sections ──
    for section in (pif.packing_sections or []):
        label = section.get('label') or ''
        el.append(section_heading_row(
            f'Quantity – {label} Packing',
            f'Container Accessories – {label}',
        ))
        el.append(two_col(
            kv_block(_LEFT_FIELDS_QTY, section.get('quantity_left', {}) or {}),
            kv_block(_RIGHT_FIELDS_ACC, section.get('accessories_right', {}) or {}),
        ))
        el.append(flex_spacer(0.7 * mm))

    # Sign + Seal stamp block — used in the first signature column
    def _make_sign_seal_cell():
        sign = Image(sign_path, width=18 * mm, height=9 * mm) if os.path.exists(sign_path) else ''
        seal = Image(seal_path, width=12 * mm, height=12 * mm) if os.path.exists(seal_path) else ''
        if not sign and not seal:
            return ''
        inner = Table([[sign, seal]], colWidths=[20 * mm, 14 * mm])
        inner.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        return inner

    sig_col_w = PW / 3
    sig_label = Paragraph('Seal & Signature', ParagraphStyle('slbl', parent=s7, alignment=1))
    sig_line = Paragraph('_________________________', ParagraphStyle('sline', parent=s7, alignment=1))
    sig_row = Table([
        [_make_sign_seal_cell(), '', ''],
        [sig_line, sig_line, sig_line],
        [sig_label, sig_label, sig_label],
    ], colWidths=[sig_col_w, sig_col_w, sig_col_w])
    sig_row.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0.5),
    ]))

    # ── Distribute leftover vertical space across the section spacers
    # so the content fills the page evenly (matches the original
    # template's even gaps between sections). When the section list is
    # short, every Spacer grows by the same delta; when it's long, the
    # KeepInFrame below shrinks the whole stack to fit one page.
    try:
        total_h = 0
        for f in el:
            try:
                _w, _h = f.wrap(content_w, content_h)
            except Exception:
                _h = 0
            total_h += _h
        # Reserve a tiny safety margin so we don't push the last section
        # right against the footer frame.
        leftover = content_h - total_h - 4 * mm
        # Only inter-section spacers are eligible — the header-area spacers
        # are kept fixed so the title block stays glued to the divider line.
        spacer_indices = [i for i, f in enumerate(el)
                          if isinstance(f, Spacer) and getattr(f, '_pif_flex', False)]
        if leftover > 0 and spacer_indices:
            per_spacer = leftover / len(spacer_indices)
            for i in spacer_indices:
                old = el[i]
                new_s = Spacer(1, max(0, old.height) + per_spacer)
                new_s._pif_flex = True
                el[i] = new_s
    except Exception:
        pass  # if measurement fails, fall through to plain shrink-to-fit

    # ── Build the story across two frames ─────────────────────────────
    # Content frame (top): the section list with redistributed spacers,
    # wrapped in KeepInFrame so it still shrinks gracefully if a future
    # PIF carries more rows than expected.
    story = []
    story.append(KeepInFrame(content_w, content_h, list(el), mode='shrink'))
    # Switch to the footer frame, anchored at the bottom of the page.
    story.append(FrameBreak())
    footer_items = [
        Paragraph(pif.footer_note or '', s8),
        Spacer(1, 2 * mm),
        sig_row,
    ]
    # Hard cap the footer height to FOOTER_H — KeepInFrame shrinks the
    # footer block if the note grows long, so it can never push the
    # signatures onto a second page.
    story.append(KeepInFrame(content_w, FOOTER_H, footer_items, mode='shrink'))

    doc.build(story)
    buffer.seek(0)
    return buffer
