import io
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer


def _build_pdf(title, header_rows, items_data, items_headers, totals, footer_text=''):
    """Generic PDF builder for orders and invoices."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm,
                            leftMargin=15*mm, rightMargin=15*mm)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('CustomTitle', parent=styles['Title'], fontSize=18,
                                  spaceAfter=6*mm, textColor=colors.HexColor('#1e3a5f'))
    elements = []

    # Title
    elements.append(Paragraph(title, title_style))
    elements.append(Spacer(1, 3*mm))

    # Header info table
    if header_rows:
        header_table = Table(header_rows, colWidths=[80*mm, 90*mm])
        header_table.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 6*mm))

    # Items table
    if items_data:
        table_data = [items_headers] + items_data
        col_count = len(items_headers)
        col_widths = [10*mm] + [None] * (col_count - 1)

        items_table = Table(table_data, repeatRows=1)
        items_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('ALIGN', (-3, 1), (-1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9f9f9')]),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 4*mm))

    # Totals
    if totals:
        totals_table = Table(totals, colWidths=[120*mm, 50*mm])
        totals_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('FONTSIZE', (0, -1), (-1, -1), 11),
            ('FONT', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('LINEABOVE', (0, -1), (-1, -1), 1, colors.HexColor('#1e3a5f')),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
        ]))
        elements.append(totals_table)
        elements.append(Spacer(1, 6*mm))

    # Footer
    if footer_text:
        elements.append(Paragraph(footer_text.replace('\n', '<br/>'), styles['Normal']))

    doc.build(elements)
    buffer.seek(0)
    return buffer


def generate_order_pdf(order):
    title = f"Order Confirmation - {order.order_number}"
    header_rows = [
        ['Client:', order.client.company_name],
        ['Order Number:', order.order_number],
        ['Status:', order.get_status_display()],
        ['Currency:', order.currency],
        ['Delivery Terms:', order.delivery_terms],
        ['Date:', order.created_at.strftime('%B %d, %Y')],
    ]

    items_headers = ['#', 'Product', 'Description', 'Qty', 'Unit', 'Unit Price', 'Total']
    items_data = []
    for i, item in enumerate(order.items.all(), 1):
        items_data.append([
            str(i),
            item.product_name,
            item.description or '',
            f'{item.quantity:,.0f}',
            item.unit,
            f'{item.unit_price:,.2f}',
            f'{item.total_price:,.2f}',
        ])

    totals = [
        ['Total:', f'{order.currency} {order.total:,.2f}'],
    ]

    footer = order.notes or ''
    return _build_pdf(title, header_rows, items_data, items_headers, totals, footer)


def generate_invoice_pdf(invoice):
    inv_type = 'Proforma Invoice' if invoice.invoice_type == 'proforma' else 'Commercial Invoice'
    title = f"{inv_type} - {invoice.invoice_number}"

    header_rows = [
        ['Client:', invoice.client.company_name],
        ['Invoice Number:', invoice.invoice_number],
        ['Status:', invoice.get_status_display()],
        ['Currency:', invoice.currency],
    ]
    if invoice.delivery_terms:
        header_rows.append(['Delivery Terms:', invoice.delivery_terms])
    if invoice.payment_terms:
        header_rows.append(['Payment Terms:', invoice.payment_terms])
    if invoice.validity:
        header_rows.append(['Validity:', invoice.validity])
    if invoice.due_date:
        header_rows.append(['Due Date:', invoice.due_date.strftime('%B %d, %Y')])
    header_rows.append(['Date:', invoice.created_at.strftime('%B %d, %Y')])

    items_headers = ['#', 'Product', 'Description', 'Qty', 'Unit', 'Unit Price', 'Total']
    items_data = []
    for i, item in enumerate(invoice.items.all(), 1):
        items_data.append([
            str(i),
            item.product_name or '',
            item.description or '',
            f'{item.quantity:,.0f}',
            item.unit or 'KG',
            f'{item.unit_price:,.2f}',
            f'{item.total_price:,.2f}',
        ])

    totals = [['Subtotal:', f'{invoice.currency} {invoice.subtotal:,.2f}']]
    if invoice.tax and float(invoice.tax) > 0:
        totals.append(['Tax:', f'{invoice.currency} {invoice.tax:,.2f}'])
    totals.append(['Total:', f'{invoice.currency} {invoice.total:,.2f}'])

    footer_parts = []
    if invoice.bank_details:
        footer_parts.append(f'<b>Bank Details:</b><br/>{invoice.bank_details}')
    if invoice.notes:
        footer_parts.append(f'<b>Notes:</b><br/>{invoice.notes}')

    return _build_pdf(title, header_rows, items_data, items_headers, totals, '\n\n'.join(footer_parts))
