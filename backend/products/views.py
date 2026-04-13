from rest_framework import viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Product, ProductDocument, CountryCompliance
from .serializers import ProductSerializer, ProductDocumentSerializer, CountryComplianceSerializer

class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    filterset_fields = ['category', 'is_active']
    search_fields = ['name', 'active_ingredient', 'category']
    def get_queryset(self):
        return Product.objects.filter(is_deleted=False)
    def perform_destroy(self, instance):
        instance.soft_delete()

class ProductDocumentViewSet(viewsets.ModelViewSet):
    serializer_class = ProductDocumentSerializer
    filterset_fields = ['product', 'doc_type']
    search_fields = ['name', 'doc_type']

    def get_queryset(self):
        return ProductDocument.objects.select_related('product').all()

    def perform_create(self, serializer):
        serializer.save()


@api_view(['GET'])
def search_product_documents(request):
    """Search for documents matching COA/MSDS/TDS/Certificate across BOTH
    the ProductDocument table AND the general Document library.

    Searches by:
      - ProductDocument.doc_type (exact match)
      - Document.name / Document.filename (keyword search)
      - Document folder name (e.g. a folder called "Certificates")

    Returns a unified list from both sources so the user can pick from
    any document in the system, regardless of where it was uploaded.
    """
    from django.db.models import Q
    from documents.models import Document

    doc_types = request.query_params.get('doc_types', '').lower().split(',')
    doc_types = [d.strip() for d in doc_types if d.strip()]
    product_id = request.query_params.get('product', None)

    results = []

    # ── Source 1: ProductDocument (typed by doc_type) ──
    pd_qs = ProductDocument.objects.select_related('product').all()
    if doc_types:
        pd_qs = pd_qs.filter(doc_type__in=doc_types)
    if product_id:
        pd_qs = pd_qs.filter(product_id=product_id)
    for doc in pd_qs.order_by('-uploaded_at')[:30]:
        results.append({
            'id': f'pd-{doc.id}',
            'name': doc.name,
            'file': doc.file.url if doc.file else '',
            'doc_type': doc.doc_type or '',
            'product_name': str(doc.product) if doc.product else '',
            'source': 'product_library',
            'uploaded_at': doc.uploaded_at.isoformat() if doc.uploaded_at else '',
        })

    # ── Source 2: General Document library (keyword search on name/filename/folder) ──
    # Build a Q filter that matches any of the requested doc types by name
    KEYWORD_MAP = {
        'coa': ['coa', 'certificate of analysis'],
        'msds': ['msds', 'sds', 'material safety', 'safety data sheet'],
        'tds': ['tds', 'technical data sheet'],
        'certificate': ['certificate', 'certification', 'cert'],
    }
    name_q = Q()
    for dt in doc_types:
        for kw in KEYWORD_MAP.get(dt, [dt]):
            name_q |= Q(name__icontains=kw) | Q(filename__icontains=kw) | Q(folder__name__icontains=kw)

    if name_q:
        doc_qs = Document.objects.filter(is_deleted=False).filter(name_q).select_related('folder', 'uploaded_by')
        for doc in doc_qs.order_by('-created_at')[:30]:
            results.append({
                'id': f'doc-{doc.id}',
                'name': doc.name or doc.filename,
                'file': doc.file.url if doc.file else '',
                'doc_type': doc.category or '',
                'product_name': doc.folder.name if doc.folder else '',
                'source': 'document_library',
                'uploaded_at': doc.created_at.isoformat() if doc.created_at else '',
            })

    return Response(results)


class CountryComplianceViewSet(viewsets.ModelViewSet):
    queryset = CountryCompliance.objects.select_related('product').all()
    serializer_class = CountryComplianceSerializer
    filterset_fields = ['product', 'country', 'is_allowed']
