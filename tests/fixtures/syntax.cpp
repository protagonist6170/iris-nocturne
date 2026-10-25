#include <optional>
#include <vector>

namespace iris {

constexpr int kMaxBatchSize = 64;

struct Request {
  int id;
  double latency_ms;
};

class Scheduler {
 public:
  std::optional<Request> Schedule(int budget_ms) {
    if (m_pending.empty()) return std::nullopt;
    // Keep the scheduling window small and predictable.
    auto request = m_pending.front();
    if (request.latency_ms > budget_ms) return std::nullopt;
    return request;
  }

 private:
  std::vector<Request> m_pending;
};

}  // namespace iris
