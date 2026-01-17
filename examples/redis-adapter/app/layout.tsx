export default function Layout({ children }: React.PropsWithChildren) {
  return (
    <html lang="en" style={{ fontFamily: 'sans-serif' }}>
      <body
        style={{
          backgroundColor: 'black',
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {children}
      </body>
    </html>
  );
}
