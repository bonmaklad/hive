import AdminGuard from './AdminGuard';

export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }) {
    return <AdminGuard>{children}</AdminGuard>;
}

