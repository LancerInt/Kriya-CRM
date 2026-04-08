from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('documents', '0003_add_folder'),
    ]

    operations = [
        migrations.AddField(
            model_name='folder',
            name='visibility',
            field=models.CharField(
                choices=[('private', 'Private'), ('public', 'Public')],
                default='private', max_length=10,
                help_text='private = visible to creator (and admin/manager); public = visible to everyone',
            ),
        ),
        migrations.AddField(
            model_name='document',
            name='visibility',
            field=models.CharField(
                choices=[('private', 'Private'), ('public', 'Public')],
                default='private', max_length=10,
                help_text='private = visible to uploader (and admin/manager); public = visible to everyone',
            ),
        ),
    ]
