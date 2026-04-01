import os, django
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
django.setup()

from accounts.models import User

for username in ['admin', 'shobana', 'dinesh', 'moulee', 'indra']:
    try:
        u = User.objects.get(username=username)
        pw = f'{username}123'
        u.set_password(pw)
        u.save()
        print(f'Reset password for {username} -> {pw} (active={u.is_active}, role={u.role})')
    except User.DoesNotExist:
        print(f'User {username} not found')
