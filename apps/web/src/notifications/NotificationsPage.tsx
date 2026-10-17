import { PageTitle } from '../layout/PageTitle';
import { NotificationList } from './NotificationList';

export function NotificationsPage() {
  return (
    <section className="page">
      <PageTitle black="AVISOS" />
      <NotificationList />
    </section>
  );
}
