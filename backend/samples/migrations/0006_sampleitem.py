from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('samples', '0005_sample_reminder_sent_at'),
        ('products', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='SampleItem',
            fields=[
                ('id', models.AutoField(primary_key=True, serialize=False)),
                ('product_name', models.CharField(blank=True, default='', max_length=255,
                                                   help_text='Company product name')),
                ('client_product_name', models.CharField(blank=True, default='', max_length=255,
                                                          help_text='Product name as the client calls it')),
                ('quantity', models.CharField(blank=True, default='', max_length=100,
                                               help_text='e.g. "5 KG", "2 LTR"')),
                ('notes', models.TextField(blank=True, default='')),
                ('product', models.ForeignKey(blank=True, null=True,
                                               on_delete=models.deletion.SET_NULL,
                                               to='products.product')),
                ('sample', models.ForeignKey(on_delete=models.deletion.CASCADE,
                                              related_name='items', to='samples.sample')),
            ],
            options={
                'db_table': 'sample_items',
                'ordering': ['id'],
            },
        ),
    ]
