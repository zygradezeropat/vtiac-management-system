"""Shared landing page helpers (plain Django)."""

STAFF_LOGIN_ROLES = [
    {
        "slug": "registrar",
        "label": "Registrar",
        "icon": (
            '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" '
            'stroke-width="1.5" stroke="currentColor" width="24" height="24">'
            '<path stroke-linecap="round" stroke-linejoin="round" '
            'd="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.9.693 2.166 1.638m-5.8 0a2.251 2.251 0 00-2.166-1.638C7.845 2.693 6.954 2.25 5.943 2.25H4.5c-1.012 0-1.9.693-2.166 1.638m0 0A2.251 2.251 0 003 4.5v13.5A2.25 2.25 0 005.25 20.25h13.5A2.25 2.25 0 0021 18V4.5a2.25 2.25 0 00-2.166-2.162z" />'
            "</svg>"
        ),
    },
    {
        "slug": "cashier",
        "label": "Cashier",
        "icon": (
            '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" '
            'stroke-width="1.5" stroke="currentColor" width="24" height="24">'
            '<path stroke-linecap="round" stroke-linejoin="round" '
            'd="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />'
            "</svg>"
        ),
    },
    {
        "slug": "trainer",
        "label": "Trainer",
        "icon": (
            '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" '
            'stroke-width="1.5" stroke="currentColor" width="24" height="24">'
            '<path stroke-linecap="round" stroke-linejoin="round" '
            'd="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />'
            "</svg>"
        ),
    },
    {
        "slug": "admin",
        "label": "Admin",
        "icon": (
            '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" '
            'stroke-width="1.5" stroke="currentColor" width="24" height="24">'
            '<path stroke-linecap="round" stroke-linejoin="round" '
            'd="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />'
            "</svg>"
        ),
    },
]


def landing_context(active_staff_role=None):
    return {
        "staff_login_roles": STAFF_LOGIN_ROLES,
        "active_staff_role": active_staff_role,
    }
