import { Signer } from './Signer';

// Страница рендерится на сервере, но к E-IMZO обращается только клиентский компонент Signer (в useEffect).
export default function Page() {
  return <Signer />;
}
