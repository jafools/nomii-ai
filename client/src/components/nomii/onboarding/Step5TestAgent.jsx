import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const Step5TestAgent = ({ nomiiTenant, markComplete, stepIndex }) => {
  const navigate = useNavigate();
  const widgetKey = nomiiTenant?.widget_key || "YOUR_WIDGET_KEY";

  const handleFinish = () => {
    markComplete(stepIndex);
    navigate("/nomii/dashboard");
  };

  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-1" style={{ color: "rgba(255,255,255,0.90)" }}>Test your AI agent</h2>
      <p className="text-sm mb-2" style={{ color: "rgba(255,255,255,0.40)" }}>This is exactly what your customers will see. Try asking it a question!</p>
      <p className="text-xs mb-8 inline-block px-3 py-1.5 rounded-lg" style={{ background: "rgba(201,168,76,0.10)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.20)" }}>
        💡 Try: "What services do you offer?" or "Tell me about your company"
      </p>

      <div className="flex justify-center mb-10">
        <div className="rounded-2xl overflow-hidden" style={{ boxShadow: "0 20px 60px -15px rgba(0,0,0,0.50), 0 0 0 1px rgba(255,255,255,0.06)" }}>
          <iframe
            src={`https://api.pontensolutions.com/widget.html?key=${encodeURIComponent(widgetKey)}&email=preview@test.com&name=Preview+User`}
            width="400"
            height="500"
            title="Nomii AI Widget Preview"
            style={{ display: "block" }}
          />
        </div>
      </div>

      <button
        onClick={handleFinish}
        className="inline-flex items-center gap-2 px-8 py-3 rounded-lg font-semibold text-base transition-all duration-200 hover:shadow-lg hover:shadow-[#C9A84C]/20 group"
        style={{ background: "linear-gradient(135deg, #C9A84C 0%, #B8943F 100%)", color: "#0B1222" }}
      >
        Go to my dashboard
        <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
};

export default Step5TestAgent;
