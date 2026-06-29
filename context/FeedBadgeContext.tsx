import { createContext, useContext, useState } from 'react';

type FeedBadgeContextType = {
    feedHasNew: boolean;
    setFeedHasNew: (val: boolean) => void;
};

const FeedBadgeContext = createContext<FeedBadgeContextType>({
    feedHasNew: false,
    setFeedHasNew: () => {},
});

export function FeedBadgeProvider({ children }: { children: React.ReactNode }) {
    const [feedHasNew, setFeedHasNew] = useState(false);
    return (
        <FeedBadgeContext.Provider value={{ feedHasNew, setFeedHasNew }}>
            {children}
        </FeedBadgeContext.Provider>
    );
}

export function useFeedBadge() {
    return useContext(FeedBadgeContext);
}
