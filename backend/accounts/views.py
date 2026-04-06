from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate, get_user_model
from .serializers import UserSerializer, UserCreateSerializer, LoginSerializer, ChangePasswordSerializer, SignupSerializer

User = get_user_model()


class IsAdminOrManager(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user and request.user.role in ('admin', 'manager')


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def login_view(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = authenticate(
        username=serializer.validated_data['username'],
        password=serializer.validated_data['password']
    )
    if not user:
        return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)
    if not user.is_active:
        return Response({'error': 'Account disabled'}, status=status.HTTP_401_UNAUTHORIZED)

    refresh = RefreshToken.for_user(user)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': UserSerializer(user).data,
    })


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def signup_view(request):
    serializer = SignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()

    refresh = RefreshToken.for_user(user)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': UserSerializer(user).data,
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
def me_view(request):
    return Response({'user': UserSerializer(request.user).data})


@api_view(['POST'])
def change_password_view(request):
    serializer = ChangePasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    if not request.user.check_password(serializer.validated_data['old_password']):
        return Response({'error': 'Current password is incorrect'}, status=status.HTTP_400_BAD_REQUEST)
    request.user.set_password(serializer.validated_data['new_password'])
    request.user.save()
    return Response({'message': 'Password updated'})


@api_view(['PATCH'])
def update_profile_view(request):
    """Let logged-in user update their own profile (name, email, phone)."""
    user = request.user
    allowed = ['first_name', 'last_name', 'email', 'phone', 'whatsapp']
    for field in allowed:
        if field in request.data:
            setattr(user, field, request.data[field])
    user.save()
    return Response(UserSerializer(user).data)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    filterset_fields = ['role', 'is_active']
    search_fields = ['first_name', 'last_name', 'email', 'username']

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action in ['create', 'destroy']:
            return [IsAdminOrManager()]
        return [permissions.IsAuthenticated()]

    @action(detail=True, methods=['post'], url_path='assign-shadow')
    def assign_shadow(self, request, pk=None):
        """Assign a shadow executive to this executive. Shadow gets access to all their clients."""
        from .models import ExecutiveShadow
        executive = self.get_object()
        shadow_id = request.data.get('shadow_id')
        if not shadow_id:
            return Response({'error': 'shadow_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            shadow_user = User.objects.get(id=shadow_id)
        except User.DoesNotExist:
            return Response({'error': 'Shadow user not found'}, status=status.HTTP_404_NOT_FOUND)
        if executive == shadow_user:
            return Response({'error': 'Cannot shadow yourself'}, status=status.HTTP_400_BAD_REQUEST)
        # Only one shadow allowed per executive
        if ExecutiveShadow.objects.filter(executive=executive).exists():
            return Response({'error': 'This executive already has a shadow assigned. Remove the existing one first.'}, status=status.HTTP_400_BAD_REQUEST)
        # An executive can only shadow one other executive
        if ExecutiveShadow.objects.filter(shadow=shadow_user).exists():
            return Response({'error': f'{shadow_user.full_name} is already shadowing another executive. Remove that assignment first.'}, status=status.HTTP_400_BAD_REQUEST)
        obj, created = ExecutiveShadow.objects.get_or_create(
            executive=executive, shadow=shadow_user,
            defaults={'assigned_by': request.user}
        )
        if created:
            from notifications.helpers import notify
            notify(
                title=f'Shadow access granted',
                message=f'{shadow_user.full_name} now has shadow access to all of {executive.full_name}\'s clients.',
                notification_type='system', link='/settings',
                actor=request.user, extra_users=[executive, shadow_user],
            )
        return Response({'status': 'assigned', 'created': created})

    @action(detail=True, methods=['post'], url_path='remove-shadow')
    def remove_shadow(self, request, pk=None):
        """Remove a shadow executive assignment."""
        from .models import ExecutiveShadow
        executive = self.get_object()
        shadow_id = request.data.get('shadow_id')
        deleted, _ = ExecutiveShadow.objects.filter(executive=executive, shadow_id=shadow_id).delete()
        return Response({'status': 'removed', 'deleted': deleted})

    @action(detail=True, methods=['get'], url_path='shadows')
    def shadows(self, request, pk=None):
        """Get all shadow assignments for this executive."""
        from .models import ExecutiveShadow
        executive = self.get_object()
        # Who shadows this executive
        shadows = ExecutiveShadow.objects.filter(executive=executive).select_related('shadow')
        shadow_list = [{'id': str(s.shadow.id), 'name': s.shadow.full_name, 'role': s.shadow.role, 'assigned_at': s.assigned_at.isoformat()} for s in shadows]
        # Who this executive shadows
        shadowing = ExecutiveShadow.objects.filter(shadow=executive).select_related('executive')
        shadowing_list = [{'id': str(s.executive.id), 'name': s.executive.full_name, 'role': s.executive.role, 'assigned_at': s.assigned_at.isoformat()} for s in shadowing]
        return Response({'shadows': shadow_list, 'shadowing': shadowing_list})
