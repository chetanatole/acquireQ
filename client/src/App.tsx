import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Resource from './pages/Resource';

function App() {
        return (
                <BrowserRouter>
                        <Routes>
                                <Route path="/" element={<Landing />} />
                                <Route path="/r/:id" element={<Resource />} />
                        </Routes>
                </BrowserRouter>
        );
}

export default App;
