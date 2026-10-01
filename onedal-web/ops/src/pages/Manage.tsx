import { useSearchParams } from 'react-router-dom';
import { Button } from '@onedal/ui/button';
import Notices from './Notices';
import Contents from './Contents';
import Releases from './Releases';
import { PageHeader } from '../ui';

/** 📣 **운영** — 기사들에게 알릴 것 · 올릴 앱(reviews/33). 한 쪽 안의 칸 셋: 공지 · 페이지 글 · 앱 배포 — 칸은 주소(`?tab=`)에 남아 옛 주소에서 바로 넘어온다 */
const TABS = [['notices', '공지'], ['contents', '페이지 글'], ['releases', '앱 배포']] as const;
type Tab = typeof TABS[number][0];

export default function Manage() {
    const [params, setParams] = useSearchParams();
    const tab: Tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') as Tab : 'notices';
    return (
        <>
            <PageHeader title="운영" sub="공지 · 페이지 글 · 앱 배포" right={<>{TABS.map(([k, label]) => <Button key={k} type="button" size="sm" variant={tab === k ? 'default' : 'outline'} onClick={() => setParams({ tab: k })}>{label}</Button>)}</>} />
            {tab === 'notices' && <Notices />}
            {tab === 'contents' && <Contents />}
            {tab === 'releases' && <Releases />}
        </>
    );
}
