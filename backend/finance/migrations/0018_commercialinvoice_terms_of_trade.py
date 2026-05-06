from django.db import migrations, models


def copy_payment_terms_to_terms_of_trade(apps, schema_editor):
    CommercialInvoice = apps.get_model('finance', 'CommercialInvoice')
    for ci in CommercialInvoice.objects.all().only('id', 'payment_terms', 'terms_of_trade'):
        if not ci.terms_of_trade and ci.payment_terms:
            ci.terms_of_trade = ci.payment_terms
            ci.save(update_fields=['terms_of_trade'])


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0017_alter_compliancedocument_doc_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='commercialinvoice',
            name='terms_of_trade',
            field=models.CharField(blank=True, help_text='e.g. D/A 30 Days', max_length=255),
        ),
        migrations.AlterField(
            model_name='commercialinvoice',
            name='payment_terms',
            field=models.CharField(blank=True, help_text='[deprecated] mirror of terms_of_trade', max_length=255),
        ),
        migrations.RunPython(copy_payment_terms_to_terms_of_trade, reverse_noop),
    ]
