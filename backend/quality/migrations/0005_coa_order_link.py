from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('quality', '0004_inspection_order_link'),
        ('orders', '0028_order_separate_coa_msds_per_group'),
    ]

    operations = [
        migrations.AddField(
            model_name='coadocument',
            name='order',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='coa_documents',
                to='orders.order',
            ),
        ),
        migrations.AddField(
            model_name='coadocument',
            name='order_document',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='quality_coa_mirror',
                to='orders.orderdocument',
            ),
        ),
        migrations.AddField(
            model_name='coadocument',
            name='name',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
    ]
