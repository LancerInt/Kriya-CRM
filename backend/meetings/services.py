import logging
import requests
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

GOOGLE_SCOPES = ['https://www.googleapis.com/auth/calendar']


class ZoomService:
    """Create Zoom meetings via Server-to-Server OAuth."""

    @staticmethod
    def _get_access_token(config):
        from common.encryption import decrypt_value
        client_id = config.zoom_client_id
        client_secret = decrypt_value(config.zoom_client_secret)
        account_id = config.zoom_account_id

        resp = requests.post(
            'https://zoom.us/oauth/token',
            params={'grant_type': 'account_credentials', 'account_id': account_id},
            auth=(client_id, client_secret),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()['access_token']

    @staticmethod
    def create_meeting(config, topic, start_time, duration_minutes=60):
        token = ZoomService._get_access_token(config)

        if isinstance(start_time, datetime):
            start_str = start_time.strftime('%Y-%m-%dT%H:%M:%S')
        else:
            start_str = str(start_time)

        payload = {
            'topic': topic,
            'type': 2,
            'start_time': start_str,
            'duration': duration_minutes,
            'timezone': 'Asia/Kolkata',
            'settings': {
                'join_before_host': True,
                'waiting_room': False,
            },
        }

        resp = requests.post(
            'https://api.zoom.us/v2/users/me/meetings',
            json=payload,
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            'join_url': data.get('join_url', ''),
            'meeting_id': str(data.get('id', '')),
        }


class GoogleMeetService:
    """Create Google Meet meetings via OAuth 2.0 (works with free Gmail)."""

    @staticmethod
    def get_auth_url(config, redirect_uri):
        """Generate the Google OAuth authorization URL (no PKCE for server-side)."""
        from common.encryption import decrypt_value
        from urllib.parse import urlencode

        params = {
            'client_id': config.google_client_id,
            'redirect_uri': redirect_uri,
            'response_type': 'code',
            'scope': ' '.join(GOOGLE_SCOPES),
            'access_type': 'offline',
            'prompt': 'consent',
        }
        auth_url = f'https://accounts.google.com/o/oauth2/auth?{urlencode(params)}'
        return auth_url, 'google_meet_auth'

    @staticmethod
    def exchange_code(config, code, redirect_uri):
        """Exchange authorization code for tokens."""
        from common.encryption import decrypt_value

        resp = requests.post('https://oauth2.googleapis.com/token', data={
            'code': code,
            'client_id': config.google_client_id,
            'client_secret': decrypt_value(config.google_client_secret),
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code',
        })
        resp.raise_for_status()
        data = resp.json()

        return {
            'access_token': data['access_token'],
            'refresh_token': data.get('refresh_token', ''),
        }

    @staticmethod
    def _get_credentials(config):
        """Build credentials from stored refresh token."""
        from google.oauth2.credentials import Credentials
        from common.encryption import decrypt_value

        return Credentials(
            token=None,
            refresh_token=decrypt_value(config.google_refresh_token),
            token_uri='https://oauth2.googleapis.com/token',
            client_id=config.google_client_id,
            client_secret=decrypt_value(config.google_client_secret),
            scopes=GOOGLE_SCOPES,
        )

    @staticmethod
    def create_meeting(config, topic, start_time, duration_minutes=60, attendee_emails=None):
        """Create a Google Calendar event with Meet link. Attendees can join without knocking."""
        from googleapiclient.discovery import build
        from google.auth.transport.requests import Request

        credentials = GoogleMeetService._get_credentials(config)

        # Refresh the token
        credentials.refresh(Request())

        service = build('calendar', 'v3', credentials=credentials)

        if isinstance(start_time, datetime):
            start_str = start_time.isoformat()
            end_str = (start_time + timedelta(minutes=duration_minutes)).isoformat()
        else:
            start_str = str(start_time)
            end_str = str(start_time)

        event = {
            'summary': topic,
            'start': {'dateTime': start_str, 'timeZone': 'Asia/Kolkata'},
            'end': {'dateTime': end_str, 'timeZone': 'Asia/Kolkata'},
            'conferenceData': {
                'createRequest': {
                    'requestId': f'kriya-{int(datetime.now().timestamp())}',
                    'conferenceSolutionKey': {'type': 'hangoutsMeet'},
                },
            },
            'guestsCanModify': False,
            'guestsCanInviteOthers': False,
        }

        # Add attendees so they can join without knocking
        if attendee_emails:
            event['attendees'] = [{'email': e} for e in attendee_emails if e]

        result = service.events().insert(
            calendarId=config.google_calendar_id or 'primary',
            body=event,
            conferenceDataVersion=1,
            sendUpdates='all',  # Send Google Calendar invite to attendees
        ).execute()

        meet_link = ''
        for ep in result.get('conferenceData', {}).get('entryPoints', []):
            if ep.get('entryPointType') == 'video':
                meet_link = ep.get('uri', '')
                break

        return {
            'join_url': meet_link,
            'event_id': result.get('id', ''),
            'html_link': result.get('htmlLink', ''),
        }
