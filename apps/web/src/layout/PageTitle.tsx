/** Título de tela em Altivo, caixa alta, par Light 300 + Black 800 (design system). */
export function PageTitle({ light, black }: { light?: string; black: string }) {
  return (
    <h1 className="screen-title page-title">
      {light && (
        <>
          <span className="screen-title-light">{light}</span>{' '}
        </>
      )}
      <span className="screen-title-black">{black}</span>
    </h1>
  );
}
