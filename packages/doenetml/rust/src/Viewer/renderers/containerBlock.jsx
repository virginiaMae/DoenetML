import React, { useEffect } from "react";
import useDoenetRenderer from "./useDoenetRenderer";
import VisibilitySensor from "react-visibility-sensor-v2";

export default React.memo(function Container(props) {
    let { name, SVs, children, actions, callAction } = useDoenetRenderer(props);

    let onChangeVisibility = (isVisible) => {
        callAction({
            action: actions.recordVisibilityChange,
            args: { isVisible },
        });
    };

    useEffect(() => {
        return () => {
            callAction({
                action: actions.recordVisibilityChange,
                args: { isVisible: false },
            });
        };
    }, []);

    if (SVs.hidden) {
        return null;
    }

    return (
        <VisibilitySensor
            partialVisibility={true}
            onChange={onChangeVisibility}
        >
            <div id={name}>
                <a name={name} />
                {children}
            </div>
        </VisibilitySensor>
    );
});
