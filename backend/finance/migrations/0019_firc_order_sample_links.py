from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0018_commercialinvoice_terms_of_trade'),
        ('orders', '0027_order_payment_phase_overrides'),
        ('samples', '0012_sample_sample_number'),
    ]

    operations = [
        # Convert Payment OneToOne -> nullable ForeignKey (lets multiple
        # FIRCs sit under the same Payment if ever needed; required so
        # we can also have Order/Sample-backed FIRCs without a Payment).
        migrations.AlterField(
            model_name='fircrecord',
            name='payment',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='firc_records',
                to='finance.payment',
            ),
        ),
        migrations.AddField(
            model_name='fircrecord',
            name='order',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='firc_records',
                to='orders.order',
            ),
        ),
        migrations.AddField(
            model_name='fircrecord',
            name='sample',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='firc_records',
                to='samples.sample',
            ),
        ),
    ]
