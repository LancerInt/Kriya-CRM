"""
Compliance Document service — renders four multi-page export-compliance documents:

    1. Examination Report (single page, simple)
    2. DBK Declaration (5 pages: FORM SDF, Appendix III-2p, Appendix IV, Annexure-A)
    3. Export Declaration Form (4 pages: Annexure-1, Annexure-A, Freight Declaration, Declaration)
    4. Factory Stuffing Annexure (3 pages: Annexure Exam Report, Particulars of Invoice, Gate Pass)

Legal text is baked in verbatim. Only editable placeholders flow through the
`ComplianceDocument.fields` JSON dict.
"""
import io
import os
import logging
from datetime import date
from django.conf import settings

logger = logging.getLogger(__name__)


EXPORTER = {
    'name': 'M/S. KRIYA BIOSYS PRIVATE LIMITED',
    'address_lines': [
        'D.No: 233, Aarthi Nagar, Mohan Nagar,',
        'Narasothipatty, Salem - 636004, Tamil Nadu, India.',
    ],
    'iec': 'AAHCK9695F',
    'gstin': '33AAHCK9695F1Z3',
    'bank_name': 'ICICI Bank Limited',
    'factory_address_lines': [
        '6/330, Thermutti Kattu Valavu,',
        'Theevattipatti Post,',
        'Omalur-Tk, Salem - 636351.',
    ],
}


def _default_fields(doc_type, order, client):
    """Seed default placeholder values from order/client data."""
    invoice_no = f'EXP{order.order_number.replace("ORD-", "")}/{date.today().strftime("%y-%m")}'
    invoice_date = date.today().strftime('%d/%m/%Y')
    product_desc = ''
    qty = ''
    if order.items.exists():
        first = order.items.first()
        product_desc = first.product_name or first.client_product_name or ''
        qty = f'{first.quantity} {first.unit}'.strip()

    common = {
        'exporter_name': EXPORTER['name'],
        'exporter_address': ', '.join(EXPORTER['address_lines']),
        'place': 'Salem',
        'declaration_date': date.today().strftime('%d.%m.%Y'),
        'invoice_no': invoice_no,
        'invoice_date': invoice_date,
        'shipping_bill_no': '',
        'shipping_bill_date': '',
        'destination_country': client.country or '',
    }

    if doc_type == 'examination_report':
        common.update({
            'quantity': qty,
            'product_description': product_desc,
            'container_count': str(order.items.count()) if order.items.count() else '',
            'containers': [
                {'container_no': '', 'eseal_no': ''},
                {'container_no': '', 'eseal_no': ''},
            ],
        })
    elif doc_type == 'dbk_declaration':
        common.update({
            'bank_name': EXPORTER['bank_name'],
            'payment_period': '1 YEAR',
            'terms_of_payment': order.payment_terms or '',
            'terms_of_delivery': order.delivery_terms or '',
            'nature_of_transaction': 'Sale',
            'method_of_valuation': 'Rule 3',
            'seller_buyer_related': 'No',
            'relationship_influenced_price': 'No',
            'previous_exports': '',
            'market_value_rows': [{'item_no': '1', 'value': ''}, {'item_no': '2', 'value': ''}],
        })
    elif doc_type == 'export_declaration':
        common.update({
            'product_description': product_desc or 'Neemcide - Neem Based Botanical Insecticide.',
            'supporting_manufacturer': 'NA',
            'manufacturer_address': 'AS ABOVE',
            'terms_of_payment': order.payment_terms or '',
            'terms_of_delivery': order.delivery_terms or '',
            'nature_of_transaction': 'Sale',
            'method_of_valuation': 'Rule 3',
            'seller_buyer_related': 'No',
            'relationship_influenced_price': 'No',
            'previous_exports': '',
            'other_information': '',
            'customs_broker_name': '',
            'broker_designation': 'MANAGER',
            'exporter_designation': 'DIRECTOR',
            'identity_card_number': '',
            'enclosed_documents': {
                'duty_exemption': True,
                'invoice_packing': True,
                'quota_inspection': False,
                'others': False,
                'others_specify': '',
            },
        })
    elif doc_type == 'non_dg_declaration':
        common.update({
            'date': date.today().strftime('%d/%m/%Y'),
            'company_name': 'Kriya Biosys Pvt Ltd',
            'product_name': product_desc or '',
            'product_description': 'Neem Oil based EC',
            'declaration_text': '',
            'signatory_label': 'Authorized Signature',
        })
    elif doc_type == 'factory_stuffing':
        common.update({
            'iec_no': EXPORTER['iec'],
            'gstin': EXPORTER['gstin'],
            'branch_code': 'NA',
            'bin_number': EXPORTER['iec'],
            'factory_address': '\n'.join(EXPORTER['factory_address_lines']),
            'examination_date': date.today().strftime('%d.%m.%Y'),
            'stuffing_start_time': '',
            'stuffing_end_time': '',
            'stuffing_duration': '',
            'cargo_description': f'{product_desc} {qty}'.strip(),
            'consignee_name': client.company_name or '',
            'consignee_address': client.address or '',
            'total_packages': '',
            'description_match': 'YES',
            'container_rows': [
                {'container_no': '', 'seal_no': '', 'truck_no': '', 'size': '40 Ft HC', 'package_count': ''},
            ],
            'signatory_name': '',
            'seal_colour': 'White',
            'gate_commodity': f'{product_desc} - {qty}'.strip(' -'),
            'gate_container_no': '',
            'gate_truck_no': '',
            'gate_seal_no': '',
            'liner_seal': '',
            'gate_time': '',
            'gate_date': date.today().strftime('%d.%m.%Y'),
        })
    return common


def create_compliance_doc_from_order(order, doc_type, user):
    from finance.models import ComplianceDocument
    existing = ComplianceDocument.objects.filter(order=order, doc_type=doc_type).first()
    if existing:
        return existing
    cd = ComplianceDocument.objects.create(
        doc_type=doc_type,
        order=order, client=order.client,
        fields=_default_fields(doc_type, order, order.client),
        created_by=user,
    )
    return cd


# ─────────────────────────── STYLES (shared) ───────────────────────────
def _setup_styles():
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    img_dir = os.path.join(settings.BASE_DIR, 'static', 'images')
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

    base = getSampleStyleSheet()['Normal']
    return {
        'br': _br, 'bf': _bf,
        'body': ParagraphStyle('body', parent=base, fontSize=11, leading=15, fontName=_br, alignment=0),
        'body_s': ParagraphStyle('body_s', parent=base, fontSize=10, leading=13, fontName=_br, alignment=0),
        'body_j': ParagraphStyle('body_j', parent=base, fontSize=11, leading=15, fontName=_br, alignment=4),
        'bold': ParagraphStyle('bold', parent=base, fontSize=11, leading=15, fontName=_bf, alignment=0),
        'bold_c': ParagraphStyle('bold_c', parent=base, fontSize=12, leading=16, fontName=_bf, alignment=1),
        'title_c_ul': ParagraphStyle('title', parent=base, fontSize=13, leading=17, fontName=_bf, alignment=1, underlineWidth=1),
        'title_lg_c': ParagraphStyle('titlelg', parent=base, fontSize=16, leading=20, fontName=_bf, alignment=1),
        'small': ParagraphStyle('small', parent=base, fontSize=9, leading=11, fontName=_br, alignment=0),
    }


def _kv_row(label, value, st, label_w=None):
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Table, TableStyle
    lw = label_w or 70 * mm
    t = Table([[Paragraph(label, st['body']), Paragraph(f': {value or ""}', st['body'])]],
              colWidths=[lw, None])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    return t


def _signature_block(st):
    from reportlab.lib.units import mm
    from reportlab.platypus import Image, Paragraph, Table, TableStyle, Spacer
    img_dir = os.path.join(settings.BASE_DIR, 'static', 'images')
    seal_path = os.path.join(img_dir, 'seal.png')
    sign_path = os.path.join(img_dir, 'sign.png')
    seal = Image(seal_path, width=16 * mm, height=16 * mm) if os.path.exists(seal_path) else ''
    sign = Image(sign_path, width=22 * mm, height=11 * mm) if os.path.exists(sign_path) else ''
    el = [
        Spacer(1, 4 * mm),
        Paragraph(f'For. {EXPORTER["name"]}', st['bold']),
        Spacer(1, 2 * mm),
        Table([[seal, sign]], colWidths=[22 * mm, 28 * mm], style=TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
        ])),
        Paragraph('Authorized Signatory', st['body']),
    ]
    return el


# ───────────────────────── 1) EXAMINATION REPORT ─────────────────────────
def _render_examination_report(doc, st, el):
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle
    f = doc.fields or {}

    el.append(Spacer(1, 25 * mm))
    el.append(Paragraph('<u>EXAMINATION REPORT</u>', st['title_c_ul']))
    el.append(Spacer(1, 10 * mm))

    qty = f.get('quantity', '')
    product = f.get('product_description', '')
    count = f.get('container_count', '')
    body = (
        f'Opened and examined the <b>{qty}</b> packing of <b>{product}</b> goods found to contain '
        f"Neem Based Botanical Insecticide. Supervised the stuffing of the cargo - Total {count} No's of IBC"
    )
    el.append(Paragraph(body, st['body']))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph('Container locked with E-SEAL as detailed below:', st['body']))
    el.append(Spacer(1, 8 * mm))

    rows = [[Paragraph('<u><b>Container No.</b></u>', st['bold']), Paragraph('<u><b>Eseal No.</b></u>', st['bold'])]]
    for r in (f.get('containers') or []):
        rows.append([Paragraph(r.get('container_no', ''), st['body']), Paragraph(r.get('eseal_no', ''), st['body'])])
    t = Table(rows, colWidths=[70 * mm, 70 * mm])
    t.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))
    el.append(t)


# ─────────────────────────── 2) DBK DECLARATION ───────────────────────────
def _render_dbk_declaration(doc, st, el):
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle, PageBreak
    f = doc.fields or {}
    sb_no = f.get('shipping_bill_no', '')
    sb_dt = f.get('shipping_bill_date', '')
    exp_name = f.get('exporter_name') or EXPORTER['name']
    bank = f.get('bank_name') or EXPORTER['bank_name']
    period = f.get('payment_period') or '1 YEAR'

    # ── PAGE 1: FORM SDF ──
    el.append(Spacer(1, 6 * mm))
    el.append(Paragraph('FORM SDF', st['title_lg_c']))
    el.append(Paragraph('(Declaration under the Foreign Exchange Regulation Act, 1973)', st['bold_c']))
    el.append(Spacer(1, 6 * mm))
    el.append(Paragraph(f'Shipping Bill No.: <b>{sb_no}</b> &nbsp;&nbsp;&amp;&nbsp;&nbsp; Date: <b>{sb_dt}</b>', st['body']))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph(f'{exp_name}, SALEM of the Exporter do hereby declare that.-', st['body']))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph(
        f'We are the seller of the goods in respect of which the declaration is being made and that the particulars given in '
        f'the shipping Bill No.: <b>{sb_no}</b> &amp; Dated: <b>{sb_dt}</b> are true and that:-', st['body']))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph('a) the value as contracted with the buyer is the same as the full export valve declared in the above shipping Bill', st['body']))
    el.append(Paragraph('or', st['body']))
    el.append(Paragraph(
        'b) The full export value of the goods is not ascertainable at the time of export and that the value declared '
        'is the which I/We, having regard to the prevailing market conditions, expect to receive on the sale of '
        'goods in the overseas market.', st['body']))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph(
        f'1. That I / We undertake that I / We will deliver to the bank name <b>{bank}</b> the foreign exchange '
        f'representing the full export value of the good on or before @ <b>{period}</b> in the manner prescribed in Rule 9 of '
        f'the Foreign Exchange Regulation Rules, 1974.', st['body']))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph('2. That I / We am / are not in the caution list of the Reserve Bank of India.', st['body']))
    el.append(Spacer(1, 10 * mm))
    el.append(Paragraph(f'<b>Name of Exporter:</b> {exp_name}', st['body']))
    el.append(Spacer(1, 6 * mm))
    el.append(Paragraph('<b>Note:</b>', st['body']))
    el.append(Paragraph(
        '1. State appropriate date of delivery which must be the due date for payment or within six months from the '
        'date of shipment, whichever is earlier, but for exports to warehouses established outside India with '
        'permission of the Reserve Bank of India, the date of delivery must be within fifteen months.', st['body_s']))
    el.append(Paragraph('2. Strike out whichever is not applicable.', st['body_s']))
    el.append(PageBreak())

    # ── PAGE 2: APPENDIX III (1/2) ──
    el.append(Paragraph('APPENDIX - III', st['title_lg_c']))
    el.append(Paragraph('DRAWBACK / DEEC DECLARATION', st['bold_c']))
    el.append(Paragraph('(To be filled for export goods under claim for Drawback)', st['bold_c']))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph(f'Shipping Bill No: <b>{sb_no}</b> &amp; Date: <b>{sb_dt}</b>', st['body']))
    el.append(Paragraph(f'I / We {exp_name}, SALEM do hereby further declare as follows:-', st['body']))
    el.append(Spacer(1, 3 * mm))

    dbk_points = [
        ('1.', 'That the quality and specification of goods as stated in this Shipping Bill are in accordance with the terms of the exports contract entered into with the buyer/consignee in pursuance of which the goods are being exported.'),
        ('2.', 'That we are not claiming benefit under "Engineering Products Export (Replenishment of Iron and Steel Intermediates) Scheme" notified vide Ministry of Commerce Notification No.539 RE/9-97 dated. 1-3-95,'),
        ('3.', 'That there is no change in the manufacturing formula and in the quantum per unit of the imported material or components, utilized in the manufacture of the export goods and that the materials or components which have been stated in the application under Rule 6 or 7 of the DBK Rules 1995 to have been imported continue to be so imported and are not been obtained from indigenous sources.'),
        ('4. (A)', 'That the export goods have not been manufactured by availing the procedure under rule 12(1) (b)/13(1) (b) of the Central Excise rules, 1944.'),
        ('OR', ''),
        ('(B)', 'That the export goods have been manufactured by availing the procedure under rule 12(1) (b)/13(1) (b) of the Central Excise Rules, 1944, but we are not claiming DBK on the basis of All Industry rates. We are/shall be claiming DBK on the basis of special brand rate in terms of the Rule 6 of the DBK Rule, 1995.'),
        ('5.', 'That the goods are not manufactured and /or exported in discharge of export obligation against an Advance License issued under the Duty Exemption Scheme (DEEC) vide relevant Import and Export Policy in force.'),
        ('OR', ''),
        ('(B)', 'That the goods are manufactured and are being exported in discharge of export obligation under the Duty Exemption Scheme (DEEC), in terms of Notification 79/95 Cus, or 80/85 Cus. Both dated 31-3-95 or 31/97 dated 1-4-97 but I/We are claiming Drawback of only the Central Excise portion of the duties on inputs specified in the Drawback Schedule.'),
        ('OR', ''),
        ('(C)', 'That the goods are manufactured and are being exported in discharge of export obligation under the duty exemption scheme (DEEC), but I/We are claiming Brand rate of Drawback'),
        ('', '* (Strike out whichever is inapplicable)'),
        ('6.', 'That the goods are not manufactured and /or exported after availing of the facility under the Passbook Scheme as contained in para 54 of the Export and Import Policy (April, 31st March, 1997).'),
        ('7.', 'That the goods are not manufactured and /or exported by a unit licensed as 100% Export Oriented Zone / Export Processing Zone or any other such Zone.'),
    ]
    for num, txt in dbk_points:
        if not txt:
            el.append(Paragraph(f'<b>{num}</b>', st['bold_c']))
        else:
            el.append(Table([[Paragraph(num, st['bold']), Paragraph(txt, st['body'])]],
                            colWidths=[20 * mm, None],
                            style=TableStyle([
                                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                                ('LEFTPADDING', (0, 0), (-1, -1), 0),
                                ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                                ('TOPPADDING', (0, 0), (-1, -1), 1),
                                ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
                            ])))
    el.append(PageBreak())

    # ── PAGE 3: APPENDIX III continued + market value table ──
    dbk_cont = [
        ('8.', 'That the goods are not manufactured and /or exported by a unit situated in any Free Trade Zone / Export Processing Zone or any other such Zone.'),
        ('9.', 'That the goods are not manufactured partly or wholly in bond under Section 65 of the Customs Act, 1962.'),
        ('10.', 'That the present market value of the goods is as follows:-'),
    ]
    for num, txt in dbk_cont:
        el.append(Table([[Paragraph(num, st['bold']), Paragraph(txt, st['body'])]],
                        colWidths=[20 * mm, None],
                        style=TableStyle([
                            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                            ('LEFTPADDING', (0, 0), (-1, -1), 0),
                            ('TOPPADDING', (0, 0), (-1, -1), 1),
                            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
                        ])))
    el.append(Spacer(1, 3 * mm))

    # Market value table
    mv_rows = f.get('market_value_rows') or [{'item_no': '1', 'value': ''}, {'item_no': '2', 'value': ''}]
    mv_header = [Paragraph('<b>Sl. No.</b>', st['bold']), Paragraph('<b>Item No. in Invoice</b>', st['bold']), Paragraph('<b>Market Value</b>', st['bold'])]
    mv_data = [mv_header]
    for i, r in enumerate(mv_rows, 1):
        mv_data.append([Paragraph(str(i), st['body']), Paragraph(r.get('item_no', ''), st['body']), Paragraph(r.get('value', ''), st['body'])])
    mv_t = Table(mv_data, colWidths=[20 * mm, 60 * mm, 90 * mm])
    mv_t.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.4, (0, 0, 0)),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    el.append(mv_t)
    el.append(Spacer(1, 4 * mm))

    dbk_tail = [
        ('11.', 'That the export value of the goods covered by this Shipping Bill is not less than the total value of all imported materials used in manufacture of such goods.'),
        ('12.', 'That the market price of the goods being exported is not less than the drawback amount being claimed.'),
        ('13.', 'That the drawback amount claimed is more than 1% of the FOB value of the export product or the drawback amount claimed is less than 1% of the FOB value but more than Rs.500/- against the shipping bill.'),
        ('14.', 'I/We undertake to repatriate export proceeds within 6 months from date of export and submit B.R.C. to Asst. Commissioner (Drawback) in case, the export proceeds are not realized within 6 months from the date of export. I/We will either furnish extension of time from R.B.I. or submit B.R.C. within such extended period or will pay back the drawback received against this Shipping Bill.'),
    ]
    for num, txt in dbk_tail:
        el.append(Table([[Paragraph(num, st['bold']), Paragraph(txt, st['body'])]],
                        colWidths=[20 * mm, None],
                        style=TableStyle([
                            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                            ('LEFTPADDING', (0, 0), (-1, -1), 0),
                            ('TOPPADDING', (0, 0), (-1, -1), 1),
                            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
                        ])))
    el.append(PageBreak())

    # ── PAGE 4: APPENDIX IV ──
    el.append(Paragraph('APPENDIX - IV', st['title_lg_c']))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph(
        '(Declaration to be filled in respect of goods for which drawback, under S.S. No. 03.02, 04.02 04.03, 07.02, 07.03, '
        '08.02, 08.03, 09.02, 09.03, 16.02, 16.03, 17.02, 17.03, 18.02, 18.03, 19.02, 19.03, 20.02, 20.03, 20.06, 20.07, 20.11, '
        '20.12, 20.16, 20.17, 21.02, 21.03, 39.01, 39.03, 39.05, 39.06, 39.07, 39.09, 39.11, 39.12, 39.13, 39.14, 39.15, 39.17, '
        '39.18, 39.20, 39.24, 42.01, 42.02, 42.05, 42.06, 42.10, 42.12, 42.01, 52.03, 52.04, 52.05, 54.03, 54.04, 54.06, 55.01, '
        '55.02, 55.03, 55.04, 55.05, 55.04, 58.01, 58.02, 58.03, 58.04, 60.06, 61.02, 61.05, 61.07, 62.02, 62.09, 62.10, 62.21, '
        '63.01, 63.04, 63.06, 63.07, 63.08, 63.10, 63.11, 64.01, 64.02, 64.03, 64.04, 64.06, 64.08, 64.09, 64.11, 71.03, 71.05, '
        '73.03, 73.11, 73.13, 73.15, 73.22, 74.04, 74.05, 74.06, 74.07, 74.12, 74.17, 74.20, 76.03, 76.04, 82.01, 83.07, 84.25, '
        '84.54, 84.58, 85.37, 83.38, 85.38, 85.40, 85.45, 85.120 85.154 87.45 63.061 has been claimed)', st['body_s']))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph(f'Shipping Bill No.: <b>{sb_no}</b> &amp; Date: <b>{sb_dt}</b>', st['body']))
    el.append(Paragraph(f'I / We {exp_name}, SALEM does hereby declare as follow:', st['body']))
    el.append(Spacer(1, 2 * mm))
    el.append(Paragraph('1. No Modvat facility has been available for any of the inputs used in the manufacture or export products.', st['body']))
    el.append(Paragraph('OR', st['bold_c']))
    el.append(Paragraph(
        '2. That the goods are being exported under bond or claim for rebate of Central Excise duty and a '
        'certificate from concerned Superintendent of Central Excise, In charge of factory of production, '
        'to the effect that Modvat facility has not been availed for the goods under export, in enclosed '
        '(drawback as per schedule is applicable)', st['body']))
    el.append(Spacer(1, 2 * mm))
    el.append(Paragraph('(* Strike out whichever is not applicable)', st['body_s']))
    el.append(Spacer(1, 6 * mm))
    el.append(Paragraph(f'Name of Exporter: {exp_name}', st['body']))
    exp_addr = f.get('exporter_address') or ', '.join(EXPORTER['address_lines'])
    el.append(Paragraph(f'Address: {exp_addr}', st['body']))
    el.append(Spacer(1, 10 * mm))
    el.append(Paragraph('(Signature & Seal of Exporter)', st['body']))
    el.extend(_signature_block(st))
    el.append(PageBreak())

    # ── PAGE 5: ANNEXURE A — EXPORT VALUE DECLARATION ──
    el.append(Paragraph('Annexure-A', st['title_lg_c']))
    el.append(Paragraph('EXPORT VALUE DECLARATION', st['bold_c']))
    el.append(Paragraph('(See Rule 7 of Customs Valuation (Determination of Value of Export Goods) Rules, 2007)', st['body_s']))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph(f'1. Shipping Bill No: <b>{sb_no}</b> &amp; Date: <b>{sb_dt}</b>', st['body']))
    el.append(Paragraph(f'2. Invoice No. &amp; Date: <b>{f.get("invoice_no", "")}</b> DT : <b>{f.get("invoice_date", "")}</b>', st['body']))
    nat = f.get('nature_of_transaction', 'Sale')
    el.append(Spacer(1, 2 * mm))
    el.append(Paragraph(f'3. Nature of Transaction: <b>{nat}</b> (options: Sale / Sale on consignment Basis / Gift / Sample / Other)', st['body']))
    mov = f.get('method_of_valuation', 'Rule 3')
    el.append(Paragraph(f'4. Method of Valuation: <b>{mov}</b> (Rule 3 / 4 / 5 / 6)', st['body']))
    el.append(Paragraph(f'5. Whether seller and buyer are related: <b>{f.get("seller_buyer_related", "No")}</b>', st['body']))
    el.append(Paragraph(f'6. If Yes, whether relationship has Influenced the price: <b>{f.get("relationship_influenced_price", "No")}</b>', st['body']))
    el.append(Paragraph(f'7. Terms of Payment: <b>{f.get("terms_of_payment", "")}</b>', st['body']))
    el.append(Paragraph(f'8. Terms of Delivery: <b>{f.get("terms_of_delivery", "")}</b>', st['body']))
    el.append(Paragraph(f'9. Previous exports of identical/similar goods, if any: {f.get("previous_exports", "")}', st['body']))
    el.append(Paragraph(f'10. Shipping Bill No: <b>{sb_no}</b> &amp; Date: <b>{sb_dt}</b>', st['body']))
    el.append(Spacer(1, 6 * mm))
    el.append(Paragraph('<b><u>DECLARATION</u></b>', st['bold_c']))
    el.append(Paragraph('1. I/We hereby declare that the information furnished above is true, complete and correct in every respect.', st['body']))
    el.append(Paragraph('2. I/We also undertake to bring to the notice of the proper officer any particulars which subsequently come to my/our knowledge which will have bearing on a valuation.', st['body']))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph(f'Place: {f.get("place", "Salem")}', st['body']))
    el.append(Paragraph(f'Date: {f.get("declaration_date", "")}', st['body']))
    el.extend(_signature_block(st))


# ────────────────────── 3) EXPORT DECLARATION FORM ──────────────────────
def _checkbox(label, ticked, st):
    mark = '&#9746;' if ticked else '&#9744;'  # ☒ / ☐
    return f'<font size="12">{mark}</font> {label}'


def _render_export_declaration(doc, st, el):
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle, PageBreak
    f = doc.fields or {}
    sb_no = f.get('shipping_bill_no', '')
    sb_dt = f.get('shipping_bill_date', '')
    inv_no = f.get('invoice_no', '')
    inv_dt = f.get('invoice_date', '')
    exp_name = f.get('exporter_name') or EXPORTER['name']
    exp_addr = f.get('exporter_address') or ', '.join(EXPORTER['address_lines'])
    place = f.get('place', 'Salem')
    decl_dt = f.get('declaration_date', '')

    # ── PAGE 1: ANNEXURE-1 ──
    el.append(Paragraph('ANNEXURE - 1', st['title_lg_c']))
    el.append(Paragraph("Exporters' Declaration required for Note/Books for availing Higher all Industry Rate of Drawback.", st['bold_c']))
    el.append(Paragraph('(Circular No.54/2001-Cus, dated 19th October, 2001)', st['body_s']))
    el.append(Spacer(1, 6 * mm))
    el.append(Paragraph(f'1. Description of the Goods : <b>{f.get("product_description", "")}</b>', st['body']))
    el.append(Paragraph(f'2. Invoice No. and Date : <b>{inv_no}</b> DT : <b>{inv_dt}</b>', st['body']))
    el.append(Paragraph(f'3. Name and address of the Exporter along with the Name of the jurisdictional Central Excise Commissionerate / Division / Range : <b>{exp_name}</b> — {exp_addr}', st['body']))
    el.append(Paragraph(f'4. Name of the Supporting Manufacturer(s) / job worker(s) along with the name of the Jurisdiction Central Excise Commissionerate / Division / Range: <b>{f.get("supporting_manufacturer", "NA")}</b>', st['body']))
    el.append(Paragraph(f'5. Address of the Manufacturer Unit / Job work : <b>{f.get("manufacturer_address", "AS ABOVE")}</b>', st['body']))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph(f'6. Premises We {exp_name} the Exporters of the above mentioned goods.', st['body']))
    el.append(Paragraph('a) We are not registered with Central Excise authorities.', st['body']))
    el.append(Paragraph('b) We have not paid any Central Excise duty on these goods.', st['body']))
    el.append(Paragraph('c) We have not availed of the Cenvat Facility under the CENVAT Credit Rules, 2001 or any notification issued there under.', st['body']))
    el.append(Paragraph(
        'We have not authorized any supporting manufacturer, Job worker to pay excise Duty and discharge the liabilities '
        'and comply with the provisions of Central Excise (No.2) Rules 2001. UNDER THE PROVISIONAL To Rules 4% of the Said rules.',
        st['body']))
    el.append(Paragraph(
        'We also undertake that in case it is discovered that the Cenvat facility has been Availed by us or by our '
        'supporting manufacturers in respect of these export Goods. We shall return the excess drawback paid to us on '
        'the basis of the Above declaration.', st['body']))
    el.extend(_signature_block(st))
    el.append(PageBreak())

    # ── PAGE 2: ANNEXURE-A EXPORT DECLARATION FORM ──
    el.append(Paragraph('ANNEXURE - A', st['title_lg_c']))
    el.append(Paragraph('EXPORT DECLARATION FORM', st['bold_c']))
    el.append(Paragraph('(See Rule 7 of Customs Valuation (Determination of Value of Export Goods) Rules, 2007)', st['body_s']))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph(f'1. Shipping Bill No. &amp; Date : <b>{sb_no}</b> &amp; <b>{sb_dt}</b>', st['body']))
    el.append(Paragraph(f'2. Invoice No. &amp; Date : <b>{inv_no}</b> DT : <b>{inv_dt}</b>', st['body']))
    el.append(Spacer(1, 2 * mm))

    nat = f.get('nature_of_transaction', 'Sale')
    opts = ['Sale', 'Sale on consignment Basis', 'Gift', 'Sample', 'Other']
    nat_line = ' &nbsp;&nbsp; '.join(_checkbox(o, o == nat, st) for o in opts)
    el.append(Paragraph(f'3. Nature of Transaction:  {nat_line}', st['body']))

    mov = f.get('method_of_valuation', 'Rule 3')
    mov_line = ' &nbsp;&nbsp; '.join(_checkbox(o, o == mov, st) for o in ['Rule 3', 'Rule 4', 'Rule 5', 'Rule 6'])
    el.append(Paragraph(f'4. Method of Valuation:  {mov_line}', st['body']))
    el.append(Paragraph('(See Export Valuation Rules)', st['body_s']))

    yn = f.get('seller_buyer_related', 'No')
    el.append(Paragraph(f"5. Whether seller and buyer are related:  {_checkbox('Yes', yn == 'Yes', st)} &nbsp;&nbsp; {_checkbox('No', yn == 'No', st)}", st['body']))
    rip = f.get('relationship_influenced_price', 'No')
    el.append(Paragraph(f"6. If Yes, whether relationship has Influenced the price:  {_checkbox('Yes', rip == 'Yes', st)} &nbsp;&nbsp; {_checkbox('No', rip == 'No', st)}", st['body']))
    el.append(Paragraph(f'7. Terms of Payment: <b>{f.get("terms_of_payment", "")}</b>', st['body']))
    el.append(Paragraph(f'8. Terms of Delivery: <b>{f.get("terms_of_delivery", "")}</b>', st['body']))
    el.append(Paragraph(f'9. Previous exports of identical/similar goods, if any: {f.get("previous_exports", "")}', st['body']))
    el.append(Paragraph(f'Shipping Bill No. and date: <b>{sb_no}</b> &amp; <b>{sb_dt}</b>', st['body']))
    el.append(Paragraph(f'10. Any other relevant information (Attach separate sheet, if necessary): {f.get("other_information", "")}', st['body']))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph('<b><u>DECLARATION</u></b>', st['bold_c']))
    el.append(Paragraph('1. I/We hereby declare that the information furnished above is true, complete and correct in every respect.', st['body']))
    el.append(Paragraph('2. I/We also undertake to bring to the notice of the proper officer any particulars which subsequently come to my/our knowledge which will have bearing on a valuation.', st['body']))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph(f'Place: <b>{place}</b>', st['body']))
    el.append(Paragraph(f'Date: <b>{decl_dt}</b>', st['body']))
    el.extend(_signature_block(st))
    el.append(PageBreak())

    # ── PAGE 3: FREIGHT DECLARATION ──
    el.append(Paragraph('FREIGHT DECLARATION', st['title_lg_c']))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph(f'I/We {exp_name}, Salem declare that the freight/Insurance declared in the Shipping bills are the actual.', st['body']))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph(f'I/We {exp_name}, Salem declare that the Freight shown in the shipping bills are as per freight schedule/freight negotiated', st['body']))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph(f'I/We {exp_name} Undertake that any increase in freight/insurance amount will be intimated to the department within 15 days of shipment and the excess amount of drawback claimed/received will be credited to the Govt. account on our own accord without any demand from the department', st['body']))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph('I/We undertake that in cases where the freight actually paid is less than the one declared; no supplementary claims shall be submitted.', st['body']))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph('I/We understand that any misdeclaration of freight paid or payable which results in loss of revenue by way of excess drawback payment is liable to be proceeded against under the customs Act, 1962.', st['body']))
    el.append(Spacer(1, 8 * mm))
    el.append(Paragraph('Declaration of Exporter', st['body']))
    el.extend(_signature_block(st))
    el.append(PageBreak())

    # ── PAGE 4: DECLARATION (enclosed docs) ──
    el.append(Paragraph('DECLARATION', st['title_lg_c']))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph('I/We declare that the particulars given herein above are true, correct and complete.', st['body']))
    el.append(Paragraph('I/We enclose herewith copies of the following documents*.', st['body']))
    enc = f.get('enclosed_documents') or {}
    el.append(Paragraph(f'1. {_checkbox("Duty Exemption Entitlement Certificate / Advance Authorisation / Duty Free Import Authorisation Declaration", enc.get("duty_exemption"), st)}', st['body']))
    el.append(Paragraph(f'2. {_checkbox("Invoice / Invoice cum packing list", enc.get("invoice_packing"), st)}', st['body']))
    el.append(Paragraph(f'3. {_checkbox("Quota / Inspection certificates", enc.get("quota_inspection"), st)}', st['body']))
    others_label = 'Others (Specify): ' + (enc.get('others_specify') or '')
    el.append(Paragraph(f'4. {_checkbox(others_label, enc.get("others"), st)}', st['body']))
    el.append(Spacer(1, 4 * mm))

    broker_tbl = Table([
        [Paragraph(f'<b>Name of the Exporter:</b> {exp_name}', st['body']),
         Paragraph(f'<b>Name of Customs Broker:</b> {f.get("customs_broker_name", "")}', st['body'])],
        [Paragraph(f'<b>Designation:</b> {f.get("exporter_designation", "DIRECTOR")}', st['body']),
         Paragraph(f'<b>Designation:</b> {f.get("broker_designation", "MANAGER")}', st['body'])],
        [Paragraph(f'<b>Identity Card Number:</b> {f.get("identity_card_number", "")}', st['body']), ''],
    ], colWidths=[90 * mm, 90 * mm])
    broker_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    el.append(broker_tbl)
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph('I/We undertake to abide by the provisions of Foreign Exchange Management Act, 1999, as amended from time to time, including realization or repatriation of foreign exchange to or from India.', st['body']))
    el.append(Paragraph('* To be submitted with the exported goods in the warehouse.', st['body_s']))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph(f'Date: <b>{decl_dt}</b>', st['body']))
    el.extend(_signature_block(st))
    el.append(Paragraph('(Signature of Exporter)', st['body']))


# ────────────────────────── 4) FACTORY STUFFING ──────────────────────────
def _render_factory_stuffing(doc, st, el):
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle, PageBreak
    f = doc.fields or {}
    sb_no = f.get('shipping_bill_no', '')
    sb_dt = f.get('shipping_bill_date', '')
    exp_name = f.get('exporter_name') or 'KRIYA BIOSYS PRIVATE LIMITED'

    # ── PAGE 1: ANNEXURE (Self-Sealed Container) ──
    el.append(Paragraph('ANNEXURE', st['title_lg_c']))
    el.append(Paragraph('Examination Report for Self-Sealed Container', st['bold_c']))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph(f'Shipping Bill No.: <b>{sb_no}</b> &nbsp;&nbsp; Date: <b>{sb_dt}</b>', st['body']))
    el.append(Spacer(1, 4 * mm))
    rows_p1 = [
        ('1. NAME OF THE EXPORTER', exp_name),
        ('2. a. IEC NO.', f.get('iec_no', EXPORTER['iec'])),
        ('    b. GSTIN', f.get('gstin', EXPORTER['gstin'])),
        ('    c. Branch code', f.get('branch_code', 'NA')),
        ('    d. BIN (PAN based Business Identification Number of the Exporter)', f.get('bin_number', EXPORTER['iec'])),
        ('3. Factory Address', f.get('factory_address', '\n'.join(EXPORTER['factory_address_lines']))),
        ('4. Date of Examination', f.get('examination_date', '')),
    ]
    for lbl, val in rows_p1:
        el.append(_kv_row(lbl, val, st, label_w=90 * mm))

    el.append(Spacer(1, 2 * mm))
    el.append(Paragraph('5. Time of Stuffing', st['bold']))
    for lbl, key in [('     Starting Time', 'stuffing_start_time'),
                      ('     Completion Time', 'stuffing_end_time'),
                      ('     Time Taken For Stuffing', 'stuffing_duration')]:
        el.append(_kv_row(lbl, f.get(key, ''), st, label_w=90 * mm))

    rows_p1_b = [
        ('6. Description of Cargo with Quantity', f.get('cargo_description', '')),
        ('7. Country of final destination', f.get('destination_country', '')),
        ('8. Name & Designation of the Authorized Signatory', f.get('signatory_name', '')),
    ]
    for lbl, val in rows_p1_b:
        el.append(_kv_row(lbl, val, st, label_w=90 * mm))
    el.append(PageBreak())

    # ── PAGE 2: Particulars of Export Invoice + container table + declaration ──
    el.append(Paragraph('Particulars of Export Invoice', st['title_lg_c']))
    el.append(Spacer(1, 3 * mm))
    el.append(_kv_row('a. Export Invoice No.', f'{f.get("invoice_no", "")}  DT : {f.get("invoice_date", "")}', st, label_w=70 * mm))
    el.append(_kv_row('    Total No. of Packages', f.get('total_packages', ''), st, label_w=70 * mm))
    el.append(_kv_row('b. Name & Address of the consignee', f'{f.get("consignee_name", "")}\n{f.get("consignee_address", "")}', st, label_w=70 * mm))
    el.append(Spacer(1, 2 * mm))
    el.append(Paragraph(f'10. Is the description of the goods, the Quantity and their value as per Particulars furnished in Export GST Invoice: <b>{f.get("description_match", "YES")}</b>', st['body']))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph('11. Container particulars:', st['bold']))
    el.append(Spacer(1, 2 * mm))

    header = [Paragraph(x, st['bold']) for x in
              ['CONTAINER NO.', 'SEAL NO', 'TRUCK NO', 'SIZE', 'No. of packages stuffed in the container']]
    data = [header]
    for r in (f.get('container_rows') or []):
        data.append([
            Paragraph(r.get('container_no', ''), st['body_s']),
            Paragraph(r.get('seal_no', ''), st['body_s']),
            Paragraph(r.get('truck_no', ''), st['body_s']),
            Paragraph(r.get('size', ''), st['body_s']),
            Paragraph(r.get('package_count', ''), st['body_s']),
        ])
    ct = Table(data, colWidths=[35 * mm, 35 * mm, 35 * mm, 25 * mm, 50 * mm])
    ct.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.4, (0, 0, 0)),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]))
    el.append(ct)
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph('12. Starting Time (moving the container to CFS):', st['body']))
    el.append(Spacer(1, 3 * mm))
    seal_no_list = ' & '.join([r.get('seal_no', '') for r in (f.get('container_rows') or []) if r.get('seal_no')])
    el.append(Paragraph(
        'I have examined the goods and the same are found to be as per the declaration. The goods are stuffed in the container and '
        f'the container was sealed with an e-seal under my supervision. The seal number is <b>{seal_no_list}</b> and the colour of '
        f'the seal is <b>{f.get("seal_colour", "White")}</b>. I undertake full responsibility for any difference in description, '
        'quality or quantity of the goods.', st['body']))
    el.append(Spacer(1, 8 * mm))
    el.append(Paragraph('SIGNATURE OF THE EXPORTER', st['bold']))
    el.extend(_signature_block(st))
    el.append(PageBreak())

    # ── PAGE 3: GATE PASS ──
    el.append(Paragraph('M/s. Kriya Biosys Private Limited', st['bold_c']))
    el.append(Paragraph(', '.join(EXPORTER['address_lines']), st['body_s']))
    el.append(Spacer(1, 6 * mm))
    el.append(Paragraph('GATE PASS', st['title_lg_c']))
    el.append(Paragraph('HOUSE STUFFING, SALEM', st['bold_c']))
    el.append(Spacer(1, 4 * mm))
    gp_rows = [
        ('INVOICE NO', f'{f.get("invoice_no", "")}  DT : {f.get("invoice_date", "")}'),
        ('COMMODITY', f.get('gate_commodity', '')),
        ('CONTAINER NO', f.get('gate_container_no', '')),
        ('TRUCK NO', f.get('gate_truck_no', '')),
        ('SEAL NO', f.get('gate_seal_no', '')),
        ('LINER SEAL', f.get('liner_seal', '')),
    ]
    for lbl, val in gp_rows:
        el.append(_kv_row(lbl, val, st, label_w=50 * mm))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph(f'The above mentioned containers are stuffed (Self-Seal) and Gate Out from Stuffing Point at (time): <b>{f.get("gate_time", "")}</b>', st['body']))
    el.append(Spacer(1, 3 * mm))
    el.append(Paragraph(f'Date: <b>{f.get("gate_date", "")}</b>', st['body']))
    el.append(Spacer(1, 4 * mm))
    el.append(Paragraph('Kindly Permit the Containers.', st['body']))


# ─────────────────────────── 5) NON-DG DECLARATION ───────────────────────────
def _render_non_dg_declaration(doc, st, el):
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer
    f = doc.fields or {}
    date_str = f.get('date') or ''
    company = f.get('company_name') or 'Kriya Biosys Pvt Ltd'
    product_name = f.get('product_name') or ''
    product_desc = f.get('product_description') or 'Neem Oil based EC'
    override = (f.get('declaration_text') or '').strip()
    sig_label = f.get('signatory_label') or 'Authorized Signature'

    body = override or (
        f'We {company}, hereby declare that our product {product_name} - {product_desc} '
        f'is a Non-Dangerous Goods which is used for agriculture purpose only. '
        f'We confirm that it is a Non Hazardous product.'
    )

    el.append(Spacer(1, 20 * mm))
    el.append(Paragraph(f'Date: {date_str}', st['body']))
    el.append(Spacer(1, 18 * mm))
    el.append(Paragraph('<u>DECLARATION LETTER</u>', st['title_c_ul']))
    el.append(Spacer(1, 8 * mm))
    el.append(Paragraph('<u>TO WHOMSOEVER IT MAY CONCERN</u>', st['title_c_ul']))
    el.append(Spacer(1, 14 * mm))
    el.append(Paragraph(body, st['body_j']))
    el.append(Spacer(1, 30 * mm))
    from reportlab.lib.styles import ParagraphStyle
    right_style = ParagraphStyle('right', parent=st['body'], alignment=2)
    el.append(Paragraph(f'For {company},', right_style))
    el.append(Spacer(1, 18 * mm))
    el.append(Paragraph(sig_label, right_style))


# ──────────────────────────────── ENTRY ────────────────────────────────
_RENDERERS = {
    'examination_report': _render_examination_report,
    'dbk_declaration': _render_dbk_declaration,
    'export_declaration': _render_export_declaration,
    'factory_stuffing': _render_factory_stuffing,
    'non_dg_declaration': _render_non_dg_declaration,
}

_TITLE_MAP = {
    'examination_report': 'Examination Report',
    'dbk_declaration': 'DBK Declaration',
    'export_declaration': 'Export Declaration Form',
    'factory_stuffing': 'Factory Stuffing Annexure',
    'non_dg_declaration': 'Non-DG Declaration Letter',
}


def generate_compliance_pdf(doc):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate

    buffer = io.BytesIO()
    pdoc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=18 * mm, bottomMargin=18 * mm,
        leftMargin=18 * mm, rightMargin=18 * mm,
        title=f'{_TITLE_MAP.get(doc.doc_type, doc.doc_type)} — {doc.order.order_number}',
        author='Kriya Biosys Private Limited',
    )
    st = _setup_styles()
    el = []
    renderer = _RENDERERS.get(doc.doc_type)
    if not renderer:
        raise ValueError(f'No renderer for doc_type={doc.doc_type}')
    renderer(doc, st, el)
    pdoc.build(el)
    buffer.seek(0)
    return buffer
