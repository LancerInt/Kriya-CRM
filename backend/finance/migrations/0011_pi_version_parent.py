from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0010_add_logistics_invoice'),
    ]

    operations = [
        migrations.AddField(
            model_name='proformainvoice',
            name='version',
            field=models.IntegerField(default=1),
        ),
        migrations.AddField(
            model_name='proformainvoice',
            name='parent',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='revisions',
                to='finance.proformainvoice',
            ),
        ),
    ]
