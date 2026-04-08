from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('samples', '0002_sample_deleted_at_sample_is_deleted_and_more'),
        ('communications', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='sample',
            name='client_product_name',
            field=models.CharField(blank=True, default='', max_length=255,
                                    help_text='Product name as the client calls it'),
        ),
        migrations.AddField(
            model_name='sample',
            name='source_communication',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=models.deletion.SET_NULL,
                related_name='samples', to='communications.communication',
                help_text='The inbound email this sample request came from',
            ),
        ),
    ]
