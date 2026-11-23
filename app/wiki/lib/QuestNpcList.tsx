
import ManagedImage from '@/components/common/ManagedImage';
// app/wiki/lib/QuestNpcList.tsx

// 퀘스트 NPC 목록 테이블
export function QuestNpcList({ npcs }: { npcs: any[] }) {
  // NPC 없을 때 빈 div 반환
  if (!npcs.length) return <div></div>;
  return (
    <table className="quest-npc-table">
      <thead>
        <tr>
          <th>아이콘</th>
          <th>이름</th>
          <th>보상</th>
          <th>좌표</th>
          <th>설명</th>
        </tr>
      </thead>
      <tbody>
        {npcs.map(npc => (
          <tr key={npc.id}>
            {/* 아이콘(이미지 or 이모지) */}
            <td>
              {npc.icon?.startsWith('http')
                ? <ManagedImage src={npc.icon} alt="" style={{ width: 28 }} />
                : npc.icon}
            </td>
            {/* 이름 */}
            <td>{npc.name}</td>
            {/* 보상: 아이콘+텍스트 */}
            <td>
              {npc.reward_icon?.startsWith('http')
                ? <ManagedImage src={npc.reward_icon} alt="" style={{ width: 20, marginRight: 5 }} />
                : npc.reward_icon}
              {npc.reward}
            </td>
            {/* 좌표 (x, y, z) */}
            <td>
              ({npc.location_x}, {npc.location_y}, {npc.location_z})
            </td>
            {/* 설명(quest 필드) */}
            <td>{npc.quest}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
