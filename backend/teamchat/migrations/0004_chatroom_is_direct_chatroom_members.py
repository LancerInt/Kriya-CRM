from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('teamchat', '0003_chatmessage_deleted_at_chatmessage_is_deleted_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='chatroom',
            name='is_direct',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='chatroom',
            name='members',
            field=models.ManyToManyField(
                blank=True,
                related_name='direct_rooms',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
