"""
Packing List service — auto-fill from order + PDF generation for the two layouts:
    * Client Packing List  (has full Consignee block, Container Details, vertical shipment strip)
    * Logistic Packing List (has Notify + short Consignee, Loading Details, vertical shipment strip)
"""
import io
import os
import logging
from datetime import date
from django.conf import settings

logger = logging.getLogger(__name__)


EXPORTER_DEFAULT = {
    'name': 'KRIYA BIOSYS PRIVATE LIMITED',
    'address_lines': [
        'D.no : 233, Aarthi Nagar,',
        'Mohan Nagar, Narasothipatti,',
        'Salem - 636004, Tamilnadu',
    ],
    'gstin': '33AAHCK9695F1Z3',
    'email': 'info@kriya.ltd',
    'iec': 'AAHCK9695F',
}

DECLARATION_DEFAULT = (
    'We Declare that this Invoice shows the Actual Price of the Goods described '
    'and that all particulars are true and correct'
)


def _consignee_dict_from_client(client):
    email = ''
    try:
        primary = client.contacts.filter(is_primary=True).first() or client.contacts.first()
        if primary:
            email = getattr(primary, 'email', '') or ''
    except Exception:
        pass
    return {
        'name': client.company_name or '',
        'tax_number': getattr(client, 'tax_number', '') or '',
        'address': getattr(client, 'address', '') or '',
        'city_state_country': f'{getattr(client, "city", "") or ""}, {getattr(client, "state", "") or ""}, {getattr(client, "country", "") or ""}'.strip(', '),
        'phone': getattr(client, 'phone_number', '') or '',
        'email': email,
    }


def _next_number(order, list_type):
    from finance.models import PackingList
    count = PackingList.objects.filter(order=order).count() + 1
    order_no = (order.order_number or '').replace('ORD-', '')
    prefix = 'CPL' if list_type == 'client' else 'LPL'
    return f'{prefix}-{order_no}-{count}'


def _auto_item(order_item):
    qty = order_item.quantity or 0
    unit = order_item.unit or ''
    return {
        'product_name': order_item.product_name or '',
        'no_kind_packages': f'{qty} {unit} Packing',
        'description_goods': order_item.client_product_name or order_item.product_name or '',
        'ncm_code': '',
        'lote': '',
        'quantity': f'{qty} {unit}',
    }


def create_packing_list_from_order(order, list_type, user):
    from finance.models import PackingList

    existing = PackingList.objects.filter(order=order, list_type=list_type).first()
    if existing:
        return existing

    client = order.client
    consignee = _consignee_dict_from_client(client)

    if list_type == 'logistic':
        notify = dict(consignee)  # sensible default: same as consignee block
        consignee_block = {}
        consignee_to = f'To the Order - {client.country or ""}'
    else:
        notify = {}
        consignee_block = consignee
        consignee_to = ''

    pl = PackingList.objects.create(
        list_type=list_type,
        invoice_number=_next_number(order, list_type),
        date=date.today(),
        order=order, client=client,
        exporter_details=EXPORTER_DEFAULT,
        consignee_details=consignee_block,
        consignee_to=consignee_to,
        notify_details=notify,
        shipment_details={
            'country_of_origin': 'India',
            'port_of_loading': '',
            'vessel_flight_no': '',
            'port_of_discharge': '',
            'country_of_final_destination': client.country or '',
            'final_destination': client.country or '',
            'buyer_reference': f'PO No : {order.po_number}' if order.po_number else '',
            'terms_of_trade': '',
            'terms_of_delivery': order.delivery_terms or '',
        },
        items=[_auto_item(it) for it in order.items.all()],
        container_details='',
        weight_summary={
            'total_packages': '',
            'ibc_containers': '',
            'total_containers': '',
            'gross_per_container': '',
            'total_gross_weight': '',
            'net_per_container': '',
            'total_net_weight': '',
        },
        loading_details=[],
        declaration=DECLARATION_DEFAULT,
        grand_total='',
        created_by=user,
    )
    return pl


# ───────────────────────────── PDF RENDER ─────────────────────────────
def generate_packing_list_pdf(pl):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image,
        KeepInFrame, Flowable,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    buffer = io.BytesIO()
    title = f'{pl.get_list_type_display()} {pl.invoice_number} - {pl.client.company_name}'
    TOP_M = 10 * mm
    BOT_M = 10 * mm
    LR_M = 10 * mm
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=TOP_M, bottomMargin=BOT_M,
        leftMargin=LR_M, rightMargin=LR_M,
        title=title, author='Kriya Biosys Private Limited',
    )

    styles = getSampleStyleSheet()
    G = colors.HexColor('#4e8a2d')      # Kriya green
    LG = colors.HexColor('#e6efdc')     # light green background (weight box)
    STRIP = colors.HexColor('#d9d9d9')  # grey strip for section headers
    BLUE = colors.HexColor('#1f4e79')   # label blue
    WATERMARK = colors.HexColor('#bfbfbf')  # faint text for "PACKING DETAILS" title
    BLACK = colors.black
    WHITE = colors.white

    img_dir = os.path.join(settings.BASE_DIR, 'static', 'images')
    logo_path = os.path.join(img_dir, 'logo.png')
    seal_path = os.path.join(img_dir, 'seal.png')
    sign_path = os.path.join(img_dir, 'sign.png')

    _bf, _br = 'Helvetica-Bold', 'Helvetica'
    _mont = 'Helvetica-Bold'
    try:
        bos_bold = os.path.join(img_dir, 'BookmanOldStyle-Bold.ttf')
        bos_reg = os.path.join(img_dir, 'BookmanOldStyle-Regular.ttf')
        mont_reg = os.path.join(img_dir, 'Montserrat-Regular.ttf')
        if os.path.exists(bos_bold):
            pdfmetrics.registerFont(TTFont('BookmanOldStyle-Bold', bos_bold))
            _bf = 'BookmanOldStyle-Bold'
        if os.path.exists(bos_reg):
            pdfmetrics.registerFont(TTFont('BookmanOldStyle', bos_reg))
            _br = 'BookmanOldStyle'
        if os.path.exists(mont_reg):
            pdfmetrics.registerFont(TTFont('Montserrat-Regular', mont_reg))
            _mont = 'Montserrat-Regular'
    except Exception:
        pass

    s = ParagraphStyle('s', parent=styles['Normal'], fontSize=8, leading=10, fontName=_br)
    sb = ParagraphStyle('sb', parent=styles['Normal'], fontSize=8, leading=10, fontName=_bf)
    ss = ParagraphStyle('ss', parent=styles['Normal'], fontSize=7, leading=9, fontName=_br)
    slabel = ParagraphStyle('sl', parent=styles['Normal'], fontSize=8, leading=10, fontName=_bf, textColor=BLUE)
    sval = ParagraphStyle('sv', parent=styles['Normal'], fontSize=8, leading=10, fontName=_br)
    sstrip = ParagraphStyle('sstrip', parent=styles['Normal'], fontSize=8.5, leading=10, fontName=_bf)
    stbl_head = ParagraphStyle('sth', parent=styles['Normal'], fontSize=8.5, leading=10, fontName=_bf, textColor=WHITE)
    stbl_body = ParagraphStyle('stb', parent=styles['Normal'], fontSize=8, leading=10, fontName=_br, alignment=1)
    stbl_body_l = ParagraphStyle('stbl', parent=styles['Normal'], fontSize=8, leading=10, fontName=_br, alignment=0)
    swater = ParagraphStyle('sw', parent=styles['Normal'], fontSize=14, leading=16, fontName=_bf, textColor=WATERMARK, alignment=2)

    PW = 190 * mm

    el = []

    # ── HEADER (logo | spacer | green PACKING LIST card with meta) ──
    logo_img = Image(logo_path, width=30 * mm, height=18 * mm) if os.path.exists(logo_path) else ''
    tagline = Paragraph('<i>Delightfully Organic!</i>', ParagraphStyle('tag', parent=ss, textColor=G))
    left_block = Table([[logo_img], [tagline]], colWidths=[60 * mm])
    left_block.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))

    green_title = Paragraph('<font color="white"><b>PACKING LIST</b></font>', ParagraphStyle('gt', fontSize=13, fontName=_mont, leading=15, alignment=1))
    green_card = Table(
        [
            [green_title],
            [Paragraph('<b>Invoice Number</b>', ParagraphStyle('inv_l', parent=s, alignment=1))],
            [Paragraph(pl.invoice_number, ParagraphStyle('inv_v', parent=s, alignment=1))],
            [Paragraph('<b>Date</b>', ParagraphStyle('dt_l', parent=s, alignment=1))],
            [Paragraph(pl.date.strftime('%d/%m/%Y') if pl.date else '', ParagraphStyle('dt_v', parent=s, alignment=1))],
        ],
        colWidths=[55 * mm],
        rowHeights=[16 * mm, 6 * mm, 7 * mm, 6 * mm, 7 * mm],
    )
    green_card.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), G),
        ('BACKGROUND', (0, 1), (-1, 1), STRIP),
        ('BACKGROUND', (0, 3), (-1, 3), STRIP),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))

    header = Table([[left_block, '', green_card]], colWidths=[60 * mm, PW - 60 * mm - 55 * mm, 55 * mm])
    header.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    el.append(header)
    el.append(Spacer(1, 3 * mm))

    # ── EXPORTER / (CONSIGNEE or NOTIFY) ──
    def party_cell(lines):
        # lines: list of paragraph HTML strings
        paras = [Paragraph(ln, s) for ln in lines]
        t = Table([[p] for p in paras], colWidths=[90 * mm])
        t.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0.5),
        ]))
        return t

    exp = pl.exporter_details or EXPORTER_DEFAULT
    exp_lines = [f'<b>{exp.get("name", "")}</b>']
    for ln in exp.get('address_lines', []):
        exp_lines.append(ln)
    if exp.get('gstin'): exp_lines.append(f'GSTIN : {exp["gstin"]}')
    if exp.get('email'): exp_lines.append(f'EMAIL : {exp["email"]}')
    if exp.get('iec'): exp_lines.append(f'IEC : {exp["iec"]}')

    # For client PL -> consignee_details has full block. For logistic PL -> notify_details has full block.
    if pl.list_type == 'logistic':
        p = pl.notify_details or {}
        right_title = 'Notify'
    else:
        p = pl.consignee_details or {}
        right_title = 'Consignee'

    right_lines = [f'<b>{p.get("name", "")}</b>']
    if p.get('tax_number'): right_lines.append(p['tax_number'])
    if p.get('address'): right_lines.append(p['address'])
    if p.get('city_state_country'): right_lines.append(p['city_state_country'])
    if p.get('phone'): right_lines.append(f'Tel No : {p["phone"]}')
    if p.get('email'): right_lines.append(f'Email : {p["email"]}')

    parties_head = Table([[Paragraph('<b>Exporter</b>', sstrip), Paragraph(f'<b>{right_title}</b>', sstrip)]],
                         colWidths=[PW / 2, PW / 2])
    parties_head.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), STRIP),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))

    parties_body = Table([[party_cell(exp_lines), party_cell(right_lines)]],
                         colWidths=[PW / 2, PW / 2])
    parties_body.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    el.append(parties_head)
    el.append(parties_body)
    el.append(Spacer(1, 2 * mm))

    # ── CONSIGNEE (logistic only) — grey strip + one-line value ──
    if pl.list_type == 'logistic':
        c_head = Table([[Paragraph('<b>Consignee</b>', sstrip)]], colWidths=[PW])
        c_head.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), STRIP),
            ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ('RIGHTPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        el.append(c_head)
        el.append(Spacer(1, 1 * mm))
        el.append(Paragraph(pl.consignee_to or '', s))
        el.append(Spacer(1, 2 * mm))

    # ── SHIPMENT DETAILS (vertical green strip + 2-col) ──
    class VerticalStrip(Flowable):
        def __init__(self, text, w, h, bg, fs=9, font=_mont):
            Flowable.__init__(self)
            self.text = text; self.width = w; self.height = h; self.bg = bg; self.fs = fs; self.font = font
        def draw(self):
            c = self.canv; c.saveState()
            c.setFillColor(self.bg); c.rect(0, 0, self.width, self.height, fill=1, stroke=0)
            c.setFillColor(WHITE); c.setFont(self.font, self.fs)
            c.translate(self.width / 2, self.height / 2); c.rotate(90)
            c.drawCentredString(0, -self.fs / 3, self.text)
            c.restoreState()

    sd = pl.shipment_details or {}
    if pl.list_type == 'client':
        left_rows = [
            ('Country of Origin', sd.get('country_of_origin', '')),
            ('Port of Loading', sd.get('port_of_loading', '')),
            ('Vessel / Flight No', sd.get('vessel_flight_no', '')),
        ]
        right_rows = [
            ('Country of Final Destination', sd.get('country_of_final_destination', '')),
            ('Port of Discharge', sd.get('port_of_discharge', '')),
            ('Buyer Reference', sd.get('buyer_reference', '')),
        ]
    else:  # logistic
        left_rows = [
            ('Country of Origin', sd.get('country_of_origin', '')),
            ('Port of Loading', sd.get('port_of_loading', '')),
            ('Vessel / Flight No', sd.get('vessel_flight_no', '')),
            ('Terms of Trade', sd.get('terms_of_trade', '')),
            ('Buyer Reference', sd.get('buyer_reference', '')),
        ]
        right_rows = [
            ('Country of Final Destination', sd.get('country_of_final_destination', '')),
            ('Port of Discharge', sd.get('port_of_discharge', '')),
            ('Final Destination', sd.get('final_destination', '')),
            ('Terms of Delivery', sd.get('terms_of_delivery', '')),
            ('', ''),
        ]

    def _shipment_table(rows):
        data = [[Paragraph(lbl, slabel), Paragraph(val or '', sval)] for lbl, val in rows]
        t = Table(data, colWidths=[45 * mm, (PW - 15 * mm) / 2 - 45 * mm])
        t.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 1),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
            ('TOPPADDING', (0, 0), (-1, -1), 1.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
        ]))
        return t

    strip_h = 7 * mm * max(len(left_rows), len(right_rows))
    strip = VerticalStrip('SHIPMENT  DETAILS', 10 * mm, strip_h, G)
    shipment_row = Table([[strip, _shipment_table(left_rows), _shipment_table(right_rows)]],
                        colWidths=[10 * mm, (PW - 10 * mm) / 2, (PW - 10 * mm) / 2])
    shipment_row.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    el.append(shipment_row)
    el.append(Spacer(1, 2 * mm))

    # ── PACKING DETAILS title (grey watermark, right) ──
    el.append(Paragraph('PACKING DETAILS', swater))
    el.append(Spacer(1, 1 * mm))

    # ── PACKING TABLE ──
    cols = ['Product Details', 'No. & Kind of Packages', 'Description of Goods', 'Quantity']
    col_w = [35 * mm, 55 * mm, 55 * mm, PW - 35 * mm - 55 * mm - 55 * mm]
    header_row = [Paragraph(c, stbl_head) for c in cols]
    body_rows = []
    for it in (pl.items or []):
        pname = Paragraph(it.get('product_name', ''), stbl_body)
        pkg_lines = it.get('no_kind_packages', '')
        if isinstance(pkg_lines, str):
            pkg_html = pkg_lines.replace('\n', '<br/>')
        else:
            pkg_html = '<br/>'.join(pkg_lines)
        pkg_p = Paragraph(pkg_html, stbl_body)
        desc_lines = [it.get('description_goods', '')]
        if it.get('ncm_code'): desc_lines.append(f'NCM Code : {it["ncm_code"]}')
        if it.get('hsn_code'): desc_lines.append(f'HSN Code : {it["hsn_code"]}')
        if it.get('lote'): desc_lines.append(f'LOTE : {it["lote"]}')
        desc_p = Paragraph('<br/>'.join([d for d in desc_lines if d]), stbl_body)
        qty_p = Paragraph(it.get('quantity', ''), stbl_body)
        body_rows.append([pname, pkg_p, desc_p, qty_p])
    if not body_rows:
        body_rows = [[Paragraph('', stbl_body)] * 4]

    ptbl = Table([header_row] + body_rows, colWidths=col_w, repeatRows=1)
    ptbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), G),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    el.append(ptbl)
    el.append(Spacer(1, 2 * mm))

    # ── Client: Container Details line + Grand Total on the right ──
    gtotal_para = Paragraph(f'<b><font color="#4e8a2d">Grand Total</font></b>   <b>{pl.grand_total or ""}</b>',
                            ParagraphStyle('gt_r', parent=sb, alignment=2, fontSize=9, leading=12))

    if pl.list_type == 'client':
        cd_p = Paragraph(f'<b>Container Details :</b>  {pl.container_details or ""}',
                         ParagraphStyle('cd', parent=s, fontName=_bf, fontSize=8.5))
        cd_row = Table([[cd_p, gtotal_para]], colWidths=[PW * 0.6, PW * 0.4])
    else:
        cd_row = Table([['', gtotal_para]], colWidths=[PW * 0.6, PW * 0.4])
    cd_row.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    el.append(cd_row)
    el.append(Spacer(1, 2 * mm))

    # ── WEIGHT SUMMARY box (light-green background) ──
    ws = pl.weight_summary or {}
    if pl.list_type == 'client':
        rows = [
            [
                Paragraph('<b>Total No. of Packages</b>', s),
                Paragraph(f'<b>Gross Weight each container</b><br/>{ws.get("gross_per_container", "")}', s),
                Paragraph(f'<b>Total Gross Weight</b><br/>{ws.get("total_gross_weight", "")}', s),
            ],
            [
                Paragraph(ws.get('total_packages', ''), s),
                Paragraph(f'<b>Net Weight each container</b><br/>{ws.get("net_per_container", "")}', s),
                Paragraph(f'<b>Total Net Weight</b><br/>{ws.get("total_net_weight", "")}', s),
            ],
        ]
    else:
        rows = [
            [
                Paragraph(f'<b>Total No. of IBC Container</b><br/>{ws.get("ibc_containers", "")}', s),
                Paragraph(f'<b>Gross weight per Container</b><br/>{ws.get("gross_per_container", "")}', s),
                Paragraph(f'<b>Net Weight</b><br/>{ws.get("net_per_container", "")}', s),
            ],
            [
                Paragraph(f'<b>Total No. of Container</b><br/>{ws.get("total_containers", "")}', s),
                Paragraph(f'<b>Total Gross Weight of {ws.get("total_containers", "")} Containers</b><br/>{ws.get("total_gross_weight", "")}', s),
                Paragraph(f'<b>Total Net Weight of {ws.get("total_containers", "")} Containers</b><br/>{ws.get("total_net_weight", "")}', s),
            ],
        ]
    ws_tbl = Table(rows, colWidths=[PW / 3] * 3)
    ws_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LG),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    el.append(ws_tbl)
    el.append(Spacer(1, 3 * mm))

    # ── Logistic: Loading Details (left) ──
    if pl.list_type == 'logistic' and (pl.loading_details or []):
        el.append(Paragraph('<b>Loading Details :</b>', sb))
        for ln in pl.loading_details:
            el.append(Paragraph(ln, s))
        el.append(Spacer(1, 2 * mm))

    # ── Declaration + signature block ──
    decl = Paragraph(
        '<b>Declaration :</b><br/>' + (pl.declaration or DECLARATION_DEFAULT) + '<br/><br/><b>E. &amp; O.E</b>',
        s,
    )

    seal_img = Image(seal_path, width=16 * mm, height=16 * mm) if os.path.exists(seal_path) else ''
    sign_img = Image(sign_path, width=22 * mm, height=11 * mm) if os.path.exists(sign_path) else ''
    right_block = Table(
        [
            [Paragraph('<b>For Kriya Biosys Private Limited</b>', ParagraphStyle('fkp', parent=s, alignment=2))],
            [Table([[seal_img, sign_img]], colWidths=[20 * mm, 28 * mm], style=TableStyle([
                ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
                ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ]))],
            [Paragraph('Authorised Signature', ParagraphStyle('asig', parent=s, alignment=2))],
        ],
        colWidths=[80 * mm],
    )
    right_block.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))

    foot = Table([[decl, right_block]], colWidths=[PW - 80 * mm, 80 * mm])
    foot.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    el.append(Spacer(1, 2 * mm))
    el.append(foot)
    el.append(Spacer(1, 2 * mm))
    el.append(Paragraph('"Go Organic ! Save Planet !"', ParagraphStyle('go', parent=ss, alignment=1, fontName=_bf)))

    # Shrink-to-fit one A4 page
    page_w, page_h = A4
    frame_w = page_w - 2 * LR_M
    frame_h = page_h - TOP_M - BOT_M
    wrapped = KeepInFrame(frame_w, frame_h, el, mode='shrink')
    doc.build([wrapped])
    buffer.seek(0)
    return buffer
