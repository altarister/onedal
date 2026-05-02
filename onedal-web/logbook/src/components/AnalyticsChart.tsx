import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

export default function AnalyticsChart() {
  const labels = ['월', '화', '수', '목', '금', '토', '일'];
  const data = {
    labels,
    datasets: [
      {
        type: 'line' as const,
        label: '주행거리 (km)',
        borderColor: '#3b82f6', // blue-500
        borderWidth: 2,
        fill: false,
        yAxisID: 'y1',
        data: [120, 190, 80, 150, 210, 50, 0],
      },
      {
        type: 'bar' as const,
        label: '매출 (원)',
        backgroundColor: 'rgba(34, 197, 94, 0.6)', // green-500
        yAxisID: 'y',
        data: [120000, 185000, 70000, 140000, 220000, 45000, 0],
      },
    ],
  };

  const options = {
    responsive: true,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: { position: 'top' as const },
    },
    scales: {
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: { display: true, text: '매출 (원)' },
      },
      y1: {
        type: 'linear' as const,
        display: true,
        position: 'right' as const,
        grid: { drawOnChartArea: false },
        title: { display: true, text: '주행거리 (km)' },
      },
    },
  };

  return (
    <div className="bg-surface border border-border-card rounded-lg p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-6">주간 매출 & 주행거리 추이</h3>
      <Chart type="bar" data={data} options={options} />
    </div>
  );
}
