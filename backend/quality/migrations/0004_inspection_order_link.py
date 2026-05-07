from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('quality', '0003_add_coa_report_counter'),
        ('orders', '0028_order_separate_coa_msds_per_group'),
        ('shipments', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='inspection',
            name='shipment',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='inspections',
                to='shipments.shipment',
            ),
        ),
        migrations.AddField(
            model_name='inspection',
            name='order',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='inspections',
                to='orders.order',
            ),
        ),
        migrations.AlterField(
            model_name='inspection',
            name='inspection_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='inspection',
            name='inspector_name',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
    ]
