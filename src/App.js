import React, { useState, useRef } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import "./App.css";

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [loading, setLoading] = useState(false);
  const resultsRef = useRef(null); // Reference to the section to capture as PDF

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("file", selectedFile);

    setLoading(true);
    try {
      const response = await fetch("http://localhost:5000/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setTransactions(data.data);
    } catch (error) {
      console.error("Error uploading file:", error);
    } finally {
      setLoading(false);
    }
  };

  const parseLocalizedNumber = (numStr) => {
    if (!numStr) return 0;
    if (typeof numStr === "number") return numStr;
    const normalized = numStr.replace(/\./g, "").replace(",", ".");
    return parseFloat(normalized);
  };

  // Since the server now returns only expenses
  const expenses = transactions
    ? transactions.sort((a, b) => a.category.localeCompare(b.category))
    : [];

  // Calculate totals per category
  const categoryTotals = expenses.reduce((acc, transaction) => {
    const amount = parseLocalizedNumber(transaction.amount);
    acc[transaction.category] = (acc[transaction.category] || 0) + amount;
    return acc;
  }, {});

  // Convert to an array and sort categories
  const sortedCategories = Object.entries(categoryTotals)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => a.category.localeCompare(b.category));

  // Calculate overall totals
  const grandTotal = sortedCategories.reduce((sum, cat) => sum + cat.total, 0);
  const individualTotal = expenses.reduce((sum, trans) => {
    const amount = parseLocalizedNumber(trans.amount);
    return sum + amount;
  }, 0);

  // Function to create and download a PDF
  const handleSaveAsPDF = () => {
    if (resultsRef.current) {
      html2canvas(resultsRef.current, { scale: 2 }).then((canvas) => {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF("p", "mm", "a4");

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        // Calculate image dimensions for the PDF page
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * pageWidth) / canvas.width;

        let heightLeft = imgHeight;
        let position = 0;

        // Add the first page
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        // Add extra pages if necessary
        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        pdf.save("result.pdf");
      });
    }
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>Expense Tracker - Troškovi</h1>
      </header>
      <main className="app-main">
        <div className="upload-container">
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
          />
          <button onClick={handleUpload} disabled={!selectedFile || loading}>
            {loading ? "Uploading..." : "Upload PDF"}
          </button>
        </div>

        {transactions && (
          <>
            {/* Wrap the content to be saved as PDF */}
            <div className="results-container" ref={resultsRef}>
              <h2>Izvlečene Transakcije (samo isplate)</h2>

              {/* Table for individual transactions */}
              <div className="transactions-section">
                <h3>Pojedinačne Transakcije</h3>
                {expenses.length > 0 ? (
                  <table className="transactions-table">
                    <thead>
                      <tr>
                        <th>Kategorija</th>
                        <th>Iznos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((trans, index) => (
                        <tr key={index}>
                          <td>{trans.category}</td>
                          <td>
                            {parseLocalizedNumber(trans.amount).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>Nema rashoda.</p>
                )}
              </div>

              {/* Table with category totals */}
              <div className="category-totals-section">
                <h3>Zbir po Kategorijama</h3>
                {sortedCategories.length > 0 ? (
                  <table className="totals-table">
                    <thead>
                      <tr>
                        <th>Kategorija</th>
                        <th>Ukupno</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCategories.map(({ category, total }, index) => (
                        <tr key={index}>
                          <td>{category}</td>
                          <td>{total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>Nema kategorizovanih rashoda.</p>
                )}
              </div>

              {/* Display grand total */}
              <div className="grand-total-section">
                <h3>Ukupan Zbir svih Rashoda:</h3>
                <p>{grandTotal.toFixed(2)}</p>
                <p className="verification-note">
                  (Provera: Zbir pojedinačnih transakcija:{" "}
                  {individualTotal.toFixed(2)})
                </p>
              </div>
            </div>

            {/* Button to download PDF */}
            <div className="pdf-button-container">
              <button onClick={handleSaveAsPDF}>Save as PDF</button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
