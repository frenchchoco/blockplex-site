import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletConnectProvider } from '@btc-vision/walletconnect';
import Nav from './components/Nav';
import Footer from './components/Footer';
import LandingPage from './pages/LandingPage';
import IdoPage from './pages/IdoPage';

export default function App() {
    return (
        <WalletConnectProvider theme="dark">
            <BrowserRouter>
                <div className="grid-bg" />
                <div className="orb orb-1" />
                <div className="orb orb-2" />
                <div className="orb orb-3" />

                <Nav />
                <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/ido" element={<IdoPage />} />
                </Routes>
                <Footer />
            </BrowserRouter>
        </WalletConnectProvider>
    );
}
