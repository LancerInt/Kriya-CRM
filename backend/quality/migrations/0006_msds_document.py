from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('quality', '0005_coa_order_link'),
        ('orders', '0028_order_separate_coa_msds_per_group'),
        ('shipments', '0001_initial'),
        ('products', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='MSDSDocument',
            fields=[
                ('id', models.UUIDField(default=__import__('uuid').uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_deleted', models.BooleanField(default=False, db_index=True)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
                ('msds_type', models.CharField(default='lab', help_text='client / logistic / lab (= shared)', max_length=20)),
                ('name', models.CharField(blank=True, default='', max_length=255)),
                ('file', models.FileField(upload_to='msds/%Y/%m/')),
                ('version', models.IntegerField(default=1)),
                ('notes', models.TextField(blank=True)),
                ('order', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='msds_documents', to='orders.order')),
                ('order_document', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='quality_msds_mirror', to='orders.orderdocument')),
                ('product', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='products.product')),
                ('shipment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='msds_documents', to='shipments.shipment')),
            ],
            options={'db_table': 'msds_documents'},
        ),
    ]
